/**
 * @fileoverview Deliveries service - webhook forwarding and retry logic.
 *
 * Uses BullMQ for reliable job processing with features:
 * - Automatic retries with exponential backoff
 * - Concurrent worker processing
 * - Delivery tracking and history
 * - Manual retry capability
 *
 * @license Apache-2.0
 */

import mongoose from "mongoose";
import { request } from "undici";
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";

import { DeliveryModel, Delivery, DeliveryStatus } from "../models/Delivery";
import { EndpointModel, Endpoint } from "../models/Endpoint";
import { Event, EventModel } from "../models/Event";
import { config } from "../config";
import { toBuffer, parseBufferBody } from "../utils/http";

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for forwarded HTTP requests (10 seconds) */
const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

/** BullMQ queue name for webhook deliveries */
const DELIVERY_QUEUE_NAME = "webhook-deliveries";

/** Maximum number of deliveries to return in a list query */
const MAX_LIST_LIMIT = 1000;
const HOOK_TOKEN_PATH_REGEX = /^\/[a-f0-9]{24}$/i;

// ============================================================================
// Validation Schemas
// ============================================================================

/** Validates prefixed public IDs */
const prefixedIdSchema = (prefix: string, message: string) =>
  z.string().trim().refine((v) => v.startsWith(prefix) && v.length > prefix.length, { message });

/** Public ID schema for events */
const eventIdSchema = prefixedIdSchema("evt_", "Invalid event ID");

/** Public ID schema for deliveries */
const deliveryIdSchema = prefixedIdSchema("dlv_", "Invalid delivery ID");

/** Schema for list pagination parameters */
const listSchema = z.object({
  limit: z.coerce.number().int().default(20).transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
  offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

// ============================================================================
// Types
// ============================================================================

/**
 * Job data stored in the BullMQ queue.
 */
type DeliveryJobData = {
  /** MongoDB ObjectId of the event to deliver */
  eventId: string;
  /** MongoDB ObjectId of the endpoint (contains forward_url) */
  endpointId: string;
  /** For retries: links to the previous failed delivery */
  parentDeliveryId?: string;
};

/**
 * Result of a delivery attempt.
 */
type DeliveryResult = {
  /** Whether the delivery was successful (2xx response) */
  success: boolean;
  /** Delivery status for recording */
  status: DeliveryStatus;
  /** HTTP status code from destination (if available) */
  responseStatus?: number;
  /** Response headers from destination */
  responseHeaders?: Record<string, string | string[]>;
  /** Response body from destination */
  responseBody?: Buffer;
  /** Time taken for the request in milliseconds */
  duration: number;
  /** Error message if delivery failed */
  errorMessage?: string;
};

// ============================================================================
// Redis Connection
// ============================================================================

/**
 * Parses a Redis URL into connection options.
 *
 * @param url - Redis URL (redis://host:port or rediss://...)
 * @returns IORedis connection options
 */
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port, 10) || 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    // Required for BullMQ compatibility
    maxRetriesPerRequest: null,
  };
}

/**
 * Creates a new Redis connection for BullMQ.
 *
 * @returns IORedis instance
 */
function createRedisConnection(): IORedis {
  const options = parseRedisUrl(config.HOOKFREIGHT_REDIS_URL);
  return new IORedis(options);
}

// ============================================================================
// Delivery Logic
// ============================================================================

function normalizeHost(url: URL): string {
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.hostname.toLowerCase()}:${port}`;
}

function isHookfreightWebhookUrl(forwardUrl: string): boolean {
  try {
    const target = new URL(forwardUrl);
    const base = new URL(config.HOOKFREIGHT_BASE_URL);
    if (normalizeHost(target) !== normalizeHost(base)) {
      return false;
    }
    const normalizedPath = target.pathname.replace(/\/+$/, "");
    return HOOK_TOKEN_PATH_REGEX.test(normalizedPath);
  } catch {
    return false;
  }
}

/**
 * Builds headers for the forwarded webhook request.
 *
 * Forwards a safe subset of original headers and adds HookFreight metadata.
 * Applies endpoint authentication if configured.
 *
 * @param originalHeaders - Headers from the original webhook request
 * @param endpoint - Endpoint configuration (may contain auth settings)
 * @returns Headers to send with forwarded request
 */
function buildForwardHeaders(
  originalHeaders: Record<string, string | string[]>,
  endpoint: Endpoint
): Record<string, string> {
  const headers: Record<string, string> = {};

  // Only forward safe headers that don't leak internal information
  const safeHeadersToForward = ["content-type", "content-encoding", "accept", "user-agent"];

  for (const key of safeHeadersToForward) {
    const value = originalHeaders[key];
    if (value) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  // Add HookFreight metadata headers
  headers["x-hookfreight-forwarded"] = "true";
  headers["x-hookfreight-timestamp"] = new Date().toISOString();

  // Apply endpoint authentication (e.g., Bearer token, API key)
  if (endpoint.authentication?.header_name && endpoint.authentication?.header_value) {
    headers[endpoint.authentication.header_name] = endpoint.authentication.header_value;
  }

  return headers;
}

/**
 * Attempts to deliver a webhook to its destination.
 *
 * @param eventId - MongoDB ObjectId of the event
 * @param endpointId - MongoDB ObjectId of the endpoint
 * @returns Delivery result with status and response data
 */
async function attemptDelivery(eventId: string, endpointId: string): Promise<DeliveryResult> {
  const startTime = Date.now();

  try {
    // Fetch event and endpoint data in parallel
    const [event, endpoint] = await Promise.all([
      EventModel.findById(eventId).lean<Event>().exec(),
      EndpointModel.findById<Endpoint>(endpointId).lean<Endpoint>().exec()
    ]);

    if (!event) {
      return {
        success: false,
        status: "failed",
        duration: Date.now() - startTime,
        errorMessage: "Event not found"
      };
    }

    if (!endpoint) {
      return {
        success: false,
        status: "failed",
        duration: Date.now() - startTime,
        errorMessage: "Endpoint not found"
      };
    }

    if (!endpoint.forwarding_enabled || !endpoint.forward_url) {
      return {
        success: false,
        status: "failed",
        duration: Date.now() - startTime,
        errorMessage: "Forwarding not enabled or URL not configured"
      };
    }

    if (isHookfreightWebhookUrl(endpoint.forward_url)) {
      return {
        success: false,
        status: "failed",
        duration: Date.now() - startTime,
        errorMessage: "Forward URL points to a HookFreight webhook URL"
      };
    }

    // Build request with forwarded headers and original body
    const headers = buildForwardHeaders(event.headers as Record<string, string | string[]>, endpoint);
    const timeoutMs = endpoint.http_timeout ?? DEFAULT_HTTP_TIMEOUT_MS;
    const bodyBuffer = toBuffer(event.body);

    // Make the HTTP request to the destination
    const response = await request(endpoint.forward_url, {
      method: event.method as any,
      headers,
      body: bodyBuffer,
      bodyTimeout: timeoutMs,
      headersTimeout: timeoutMs,
      throwOnError: false
    });

    const responseBody = Buffer.from(await response.body.arrayBuffer());
    const duration = Date.now() - startTime;
    const isSuccess = response.statusCode >= 200 && response.statusCode < 300;

    // Extract response headers
    const responseHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) {
        responseHeaders[key] = value;
      }
    }

    return {
      success: isSuccess,
      status: isSuccess ? "delivered" : "failed",
      responseStatus: response.statusCode,
      responseHeaders,
      responseBody,
      duration,
      errorMessage: isSuccess ? undefined : `Received status ${response.statusCode}`
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Detect timeout errors from Undici
    const isTimeout =
      errorMessage.includes("timeout") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("UND_ERR_HEADERS_TIMEOUT") ||
      errorMessage.includes("UND_ERR_BODY_TIMEOUT");

    return {
      success: false,
      status: isTimeout ? "timeout" : "failed",
      duration,
      errorMessage
    };
  }
}

/**
 * Records a delivery attempt in the database.
 *
 * @param eventId - MongoDB ObjectId of the event
 * @param endpointId - MongoDB ObjectId of the endpoint
 * @param result - Delivery result from attemptDelivery
 * @param parentDeliveryId - Previous delivery attempt (for retry chains)
 * @returns The created Delivery document
 */
async function recordDelivery(
  eventId: string,
  endpointId: string,
  result: DeliveryResult,
  parentDeliveryId?: string
): Promise<mongoose.Document & Delivery & { _id: mongoose.Types.ObjectId }> {
  const endpoint = await EndpointModel.findById<Endpoint>(endpointId).lean<Endpoint>().exec();

  const delivery = await DeliveryModel.create({
    parent_delivery_id: parentDeliveryId ? new mongoose.Types.ObjectId(parentDeliveryId) : undefined,
    status: result.status,
    event_id: new mongoose.Types.ObjectId(eventId),
    destination_url: endpoint?.forward_url ?? "unknown",
    response_status: result.responseStatus,
    response_headers: result.responseHeaders,
    response_body: result.responseBody,
    duration: result.duration,
    error_message: result.errorMessage
  });

  return delivery as mongoose.Document & Delivery & { _id: mongoose.Types.ObjectId };
}

// ============================================================================
// Queue Management
// ============================================================================

/** Singleton BullMQ queue instance */
let deliveryQueue: Queue<DeliveryJobData> | null = null;

/** Singleton BullMQ worker instance */
let deliveryWorker: Worker<DeliveryJobData> | null = null;

/**
 * Gets or creates the delivery queue.
 *
 * Configures the queue with:
 * - Exponential backoff for retries
 * - Automatic cleanup of completed/failed jobs
 *
 * @returns BullMQ Queue instance
 */
function getDeliveryQueue(): Queue<DeliveryJobData> {
  if (!deliveryQueue) {
    deliveryQueue = new Queue<DeliveryJobData>(DELIVERY_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: config.HOOKFREIGHT_QUEUE_MAX_RETRIES,
        backoff: {
          type: "exponential",
          delay: 1000, // 1s, 2s, 4s, 8s, 16s...
        },
        removeOnComplete: {
          age: 86400,   // Keep completed jobs for 24 hours
          count: 1000,  // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 604800,  // Keep failed jobs for 7 days
        },
      },
    });

    console.log("[DeliveryQueue] Queue initialized");
  }
  return deliveryQueue;
}

/**
 * Gets or creates the delivery worker.
 *
 * The worker processes delivery jobs with:
 * - Configurable concurrency
 * - Automatic retries on failure
 * - Delivery tracking for retry chains
 *
 * @returns BullMQ Worker instance
 */
function getDeliveryWorker(): Worker<DeliveryJobData> {
  if (!deliveryWorker) {
    deliveryWorker = new Worker<DeliveryJobData>(
      DELIVERY_QUEUE_NAME,
      async (job: Job<DeliveryJobData>) => {
        const { eventId, endpointId, parentDeliveryId } = job.data;
        const attemptNumber = job.attemptsMade + 1;

        console.log(
          `[DeliveryWorker] Processing job ${job.id} ` +
          `(event: ${eventId}, attempt: ${attemptNumber}/${config.HOOKFREIGHT_QUEUE_MAX_RETRIES})`
        );

        // Attempt the delivery
        const result = await attemptDelivery(eventId, endpointId);

        // Record the delivery attempt
        const delivery = await recordDelivery(eventId, endpointId, result, parentDeliveryId);

        if (!result.success) {
          // 4xx responses are client errors (bad payload, auth, etc.) -- retrying won't help.
          // Only retry on 5xx, timeouts, and network errors (no response status).
          const status = result.responseStatus;
          const isRetryable = !status || status >= 500 || result.status === "timeout";

          if (isRetryable) {
            await job.updateData({
              ...job.data,
              parentDeliveryId: delivery._id.toString(),
            });
            throw new Error(result.errorMessage ?? "Delivery failed");
          }

          // Non-retryable failure -- move straight to failed without further attempts
          console.warn(
            `[DeliveryWorker] Event ${eventId} failed with non-retryable status ${status}, skipping retry`
          );
          await job.moveToFailed(
            new Error(result.errorMessage ?? `Non-retryable status ${status}`),
            job.token ?? "",
            false
          );
        }

        console.log(`[DeliveryWorker] Job ${job.id} completed successfully`);
        return { deliveryId: delivery._id.toString(), status: result.status };
      },
      {
        connection: createRedisConnection(),
        concurrency: config.HOOKFREIGHT_QUEUE_CONCURRENCY,
      }
    );

    // Log successful deliveries
    deliveryWorker.on("completed", (job) => {
      console.log(`[DeliveryWorker] Event ${job.data.eventId} delivered successfully`);
    });

    // Log failed deliveries with retry information
    deliveryWorker.on("failed", (job, err) => {
      if (job) {
        const isLastAttempt = job.attemptsMade >= config.HOOKFREIGHT_QUEUE_MAX_RETRIES;
        if (isLastAttempt) {
          console.error(
            `[DeliveryWorker] Event ${job.data.eventId} permanently failed ` +
            `after ${job.attemptsMade} attempts: ${err.message}`
          );
        } else {
          console.warn(
            `[DeliveryWorker] Event ${job.data.eventId} failed ` +
            `(attempt ${job.attemptsMade}/${config.HOOKFREIGHT_QUEUE_MAX_RETRIES}): ${err.message}`
          );
        }
      }
    });

    // Log worker errors
    deliveryWorker.on("error", (err) => {
      console.error("[DeliveryWorker] Worker error:", err);
    });

    console.log(`[DeliveryWorker] Worker initialized with concurrency: ${config.HOOKFREIGHT_QUEUE_CONCURRENCY}`);
  }
  return deliveryWorker;
}

/**
 * Initializes the delivery queue and worker.
 * Should be called once during application startup.
 */
function initializeDeliverySystem(): void {
  getDeliveryQueue();
  getDeliveryWorker();
}

// ============================================================================
// Exported Service
// ============================================================================

/**
 * Deliveries service for webhook forwarding and tracking.
 */
export const deliveriesService = {
  /**
   * Initializes the delivery system (queue and worker).
   * Must be called before handling events.
   */
  initialize: (): void => {
    initializeDeliverySystem();
  },

  /**
   * Queues an event for delivery.
   *
   * Checks if forwarding is enabled for the endpoint before queuing.
   * Non-blocking - returns immediately after queuing.
   *
   * @param event - The Event document to deliver
   */
  handleEvent: async (event: Event & { _id: mongoose.Types.ObjectId }): Promise<void> => {
    const endpoint = await EndpointModel.findById<Endpoint>(event.endpoint_id)
      .lean<Endpoint>()
      .exec();

    if (!endpoint) {
      console.warn(`[DeliveriesService] Endpoint ${event.endpoint_id} not found`);
      return;
    }

    if (!endpoint.forwarding_enabled) {
      console.log(`[DeliveriesService] Forwarding disabled for endpoint ${event.endpoint_id}`);
      return;
    }

    if (!endpoint.forward_url) {
      console.warn(`[DeliveriesService] No forward_url configured for endpoint ${event.endpoint_id}`);
      return;
    }

    const queue = getDeliveryQueue();
    const job = await queue.add(
      "deliver",
      {
        eventId: event._id.toString(),
        endpointId: event.endpoint_id.toString(),
      },
      {
        jobId: `delivery-${event._id.toString()}`,
      }
    );

    console.log(
      `[DeliveriesService] Event ${event._id} queued for delivery ` +
      `(job: ${job.id}, url: ${endpoint.forward_url})`
    );
  },

  /**
   * Manually retries a failed delivery.
   *
   * Creates a new job linked to the original delivery for tracking.
   *
   * @param deliveryId - Public ID of the delivery to retry (dlv_...)
   * @throws Error if delivery or event not found
   */
  retryDelivery: async (deliveryId: string): Promise<void> => {
    const parsedDeliveryId = deliveryIdSchema.parse(deliveryId);

    const delivery = await DeliveryModel.findOne({ public_id: parsedDeliveryId })
      .lean<Delivery & { _id: mongoose.Types.ObjectId }>()
      .exec();
    if (!delivery) {
      throw new Error("Delivery not found");
    }

    const event = await EventModel.findById(delivery.event_id).lean<Event>().exec();
    if (!event) {
      throw new Error("Event not found");
    }

    const queue = getDeliveryQueue();
    const job = await queue.add(
      "retry",
      {
        eventId: delivery.event_id.toString(),
        endpointId: event.endpoint_id.toString(),
        parentDeliveryId: delivery._id.toString(),
      },
      {
        jobId: `retry-${parsedDeliveryId}-${Date.now()}`,
      }
    );

    console.log(`[DeliveriesService] Manual retry queued for delivery ${parsedDeliveryId} (job: ${job.id})`);
  },

  /**
   * Lists delivery attempts for a specific event.
   *
   * @param eventId - Public ID of the event (evt_...)
   * @param limit - Maximum deliveries to return (default: 20, max: 1000)
   * @param offset - Number to skip (default: 0)
   * @returns Paginated list of deliveries with has_next indicator
   */
  getDeliveriesByEventId: async (eventId: string, limit?: unknown, offset?: unknown) => {
    const parsedEventId = eventIdSchema.parse(eventId);
    const parsed = listSchema.parse({ limit, offset });

    const event = await EventModel.findOne({ public_id: parsedEventId }, { _id: 1, public_id: 1 });
    if (!event) {
      return { deliveries: [], has_next: false, limit: parsed.limit, offset: parsed.offset };
    }

    // Fetch one extra to determine if there are more pages
    const docs = await DeliveryModel.find({ event_id: event._id })
      .sort({ createdAt: -1 })
      .skip(parsed.offset)
      .limit(parsed.limit + 1)
      .populate("parent_delivery_id", "public_id -_id")
      .lean<(Delivery & { _id: mongoose.Types.ObjectId; public_id: string })[]>()
      .exec();

    const has_next = docs.length > parsed.limit;

    // Parse response body for JSON display
    const deliveries = docs.slice(0, parsed.limit).map((doc) => {
      const { _id: _mongoId, public_id, __v: _version, parent_delivery_id, ...rest } = doc as any;
      const parent =
        typeof parent_delivery_id === "string"
          ? parent_delivery_id
          : (parent_delivery_id as { public_id?: string } | null)?.public_id;

      return {
        ...rest,
        id: public_id,
        event_id: event.public_id,
        ...(parent ? { parent_delivery_id: parent } : {}),
        response_body: parseBufferBody(doc.response_body),
      };
    });

    return { deliveries, has_next, limit: parsed.limit, offset: parsed.offset };
  },

  /**
   * Gets current queue statistics.
   *
   * @returns Object with counts for waiting, active, completed, failed, delayed jobs
   */
  getQueueStats: async (): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> => {
    const queue = getDeliveryQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  },

  /**
   * Gracefully shuts down the delivery system.
   *
   * Waits for in-progress jobs to complete before closing.
   * Should be called during application shutdown.
   */
  shutdown: async (): Promise<void> => {
    console.log("[DeliveriesService] Shutting down...");

    if (deliveryWorker) {
      await deliveryWorker.close();
      deliveryWorker = null;
    }

    if (deliveryQueue) {
      await deliveryQueue.close();
      deliveryQueue = null;
    }

    console.log("[DeliveriesService] Shutdown complete");
  },
};
