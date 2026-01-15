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

const DEFAULT_HTTP_TIMEOUT_MS = 10_000;
const DELIVERY_QUEUE_NAME = "webhook-deliveries";
const MAX_LIST_LIMIT = 1000;

const objectIdSchema = z.string().trim().refine((v) => mongoose.isValidObjectId(v), { message: "Invalid ID" });

const listSchema = z.object({
    limit: z.coerce.number().int().default(20).transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
    offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

type DeliveryJobData = {
    eventId: string;
    endpointId: string;
    parentDeliveryId?: string;
};

type DeliveryResult = {
    success: boolean;
    status: DeliveryStatus;
    responseStatus?: number;
    responseHeaders?: Record<string, string | string[]>;
    responseBody?: Buffer;
    duration: number;
    errorMessage?: string;
};

function parseRedisUrl(url: string) {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || 6379,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        maxRetriesPerRequest: null,
    };
}

function createRedisConnection(): IORedis {
    const options = parseRedisUrl(config.HOOKFREIGHT_REDIS_URL);
    return new IORedis(options);
}

function buildForwardHeaders(
    originalHeaders: Record<string, string | string[]>,
    endpoint: Endpoint
): Record<string, string> {
    const headers: Record<string, string> = {};

    const safeHeadersToForward = ["content-type", "content-encoding", "accept", "user-agent"];

    for (const key of safeHeadersToForward) {
        const value = originalHeaders[key];
        if (value) {
            headers[key] = Array.isArray(value) ? value[0] : value;
        }
    }

    headers["x-hookfreight-forwarded"] = "true";
    headers["x-hookfreight-timestamp"] = new Date().toISOString();

    if (endpoint.authentication?.header_name && endpoint.authentication?.header_value) {
        headers[endpoint.authentication.header_name] = endpoint.authentication.header_value;
    }

    return headers;
}

async function attemptDelivery(eventId: string, endpointId: string): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
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

        const headers = buildForwardHeaders(event.headers as Record<string, string | string[]>, endpoint);
        const timeoutMs = endpoint.http_timeout ?? DEFAULT_HTTP_TIMEOUT_MS;
        const bodyBuffer = toBuffer(event.body);

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

let deliveryQueue: Queue<DeliveryJobData> | null = null;
let deliveryWorker: Worker<DeliveryJobData> | null = null;

function getDeliveryQueue(): Queue<DeliveryJobData> {
    if (!deliveryQueue) {
        deliveryQueue = new Queue<DeliveryJobData>(DELIVERY_QUEUE_NAME, {
            connection: createRedisConnection(),
            defaultJobOptions: {
                attempts: config.HOOKFREIGHT_QUEUE_MAX_RETRIES,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
                removeOnComplete: {
                    age: 86400,
                    count: 1000,
                },
                removeOnFail: {
                    age: 604800,
                },
            },
        });

        console.log("[DeliveryQueue] Queue initialized");
    }
    return deliveryQueue;
}

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

                const result = await attemptDelivery(eventId, endpointId);

                const delivery = await recordDelivery(eventId, endpointId, result, parentDeliveryId);

                if (!result.success) {
                    await job.updateData({
                        ...job.data,
                        parentDeliveryId: delivery._id.toString(),
                    });

                    throw new Error(result.errorMessage ?? "Delivery failed");
                }

                console.log(`[DeliveryWorker] Job ${job.id} completed successfully`);
                return { deliveryId: delivery._id.toString(), status: result.status };
            },
            {
                connection: createRedisConnection(),
                concurrency: config.HOOKFREIGHT_QUEUE_CONCURRENCY,
            }
        );

        deliveryWorker.on("completed", (job) => {
            console.log(`[DeliveryWorker] Event ${job.data.eventId} delivered successfully`);
        });

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

        deliveryWorker.on("error", (err) => {
            console.error("[DeliveryWorker] Worker error:", err);
        });

        console.log(`[DeliveryWorker] Worker initialized with concurrency: ${config.HOOKFREIGHT_QUEUE_CONCURRENCY}`);
    }
    return deliveryWorker;
}

function initializeDeliverySystem(): void {
    getDeliveryQueue();
    getDeliveryWorker();
}

export const deliveriesService = {
    initialize: (): void => {
        initializeDeliverySystem();
    },

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

    retryDelivery: async (deliveryId: string): Promise<void> => {
        const parsedDeliveryId = objectIdSchema.parse(deliveryId);

        const delivery = await DeliveryModel.findById(parsedDeliveryId).lean<Delivery>().exec();
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
                parentDeliveryId: parsedDeliveryId,
            },
            {
                jobId: `retry-${parsedDeliveryId}-${Date.now()}`,
            }
        );

        console.log(`[DeliveriesService] Manual retry queued for delivery ${parsedDeliveryId} (job: ${job.id})`);
    },

    getDeliveriesByEventId: async (eventId: string, limit?: unknown, offset?: unknown) => {
        const parsedEventId = objectIdSchema.parse(eventId);
        const parsed = listSchema.parse({ limit, offset });

        const docs = await DeliveryModel.find({ event_id: parsedEventId })
            .sort({ createdAt: -1 })
            .skip(parsed.offset)
            .limit(parsed.limit + 1)
            .lean<Delivery[]>()
            .exec();

        const has_next = docs.length > parsed.limit;
        const deliveries = docs.slice(0, parsed.limit).map((doc) => ({
            ...doc,
            response_body: parseBufferBody(doc.response_body)
        }));

        return { deliveries, has_next, limit: parsed.limit, offset: parsed.offset };
    },

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
