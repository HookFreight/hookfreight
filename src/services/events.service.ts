/**
 * @fileoverview Events service - business logic for webhook event handling.
 *
 * Handles incoming webhook requests by:
 * 1. Validating the request and endpoint
 * 2. Storing the complete request data as an Event
 * 3. Queuing the event for delivery
 *
 * @license Apache-2.0
 */

import type { Request } from "express";
import { z } from "zod";

import { EventModel } from "../models/Event";
import { EndpointModel } from "../models/Endpoint";
import { eventToHttpResponse, httpError } from "../utils/http";
import { deliveriesService } from "./deliveries.service";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of events to return in a list query */
const MAX_LIST_LIMIT = 50;

/** HTTP methods allowed for webhook ingestion */
const ALLOWED_METHODS = new Set(["POST", "PUT", "PATCH", "GET"]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts the first value from a header that may be a string or array.
 *
 * @param v - Header value (string, array, or undefined)
 * @returns First value or undefined
 */
function firstHeaderValue(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Reconstructs the full destination URL from the request.
 *
 * Handles proxied requests by checking X-Forwarded-* headers.
 *
 * @param req - Express request object
 * @returns Full URL including protocol, host, and path
 */
function buildDestinationUrl(req: Request): string {
  const xfProtoRaw = firstHeaderValue(req.headers["x-forwarded-proto"] as any);
  const xfHostRaw = firstHeaderValue(req.headers["x-forwarded-host"] as any);

  const proto = (xfProtoRaw?.split(",")[0]?.trim() || req.protocol || "http");
  const host = (xfHostRaw?.split(",")[0]?.trim() || req.get("host") || "");
  const pathAndQuery = req.originalUrl ?? req.url ?? "";

  return host ? `${proto}://${host}${pathAndQuery}` : pathAndQuery;
}

// ============================================================================
// Validation Schemas
// ============================================================================

/** Validates prefixed public IDs */
const prefixedIdSchema = (prefix: string, message: string) =>
  z.string().trim().refine((v) => v.startsWith(prefix) && v.length > prefix.length, { message });

/** Public ID schema for endpoints */
const endpointIdSchema = prefixedIdSchema("end_", "Invalid endpoint ID");

/** Public ID schema for events */
const eventIdSchema = prefixedIdSchema("evt_", "Invalid event ID");

/** Schema for list pagination parameters */
const listSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .default(10)
    .transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
  offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Events service for webhook capture and retrieval.
 */
export const eventsService = {
  /**
   * Captures an incoming webhook request and stores it as an Event.
   *
   * Process:
   * 1. Validates the HTTP method
   * 2. Looks up the endpoint by hook_token
   * 3. Extracts and stores request data (headers, body, metadata)
   * 4. Queues the event for delivery (async, non-blocking)
   *
   * @param req - Express request object (with rawBody from middleware)
   * @returns The created Event document
   * @throws HttpError(405) if method is not allowed
   * @throws HttpError(404) if endpoint doesn't exist
   */
  createEvent: async (req: Request) => {
    const method = req.method.toUpperCase();

    // Only allow specific HTTP methods for webhooks
    if (!ALLOWED_METHODS.has(method)) {
      throw httpError(405, "method_not_allowed");
    }

    // Find the endpoint by hook_token from URL
    const endpoint = await EndpointModel.findOne({ hook_token: req.params.hook_token });
    if (!endpoint) {
      throw httpError(404, "endpoint_not_found");
    }

    // TODO: MATCH HEADERS AND BODY AGAINST ENDPOINT CONFIGURATION. IF MATCH, RETURN 200. IF NOT, RETURN 400.
    // TODO: ADD RATE LIMITING/RATE LIMITING DURATION AND HTTP TIMEOUT FROM ENDPOINT CONFIG.

    // Get the raw body (prefer rawBody from middleware, fall back to parsed body)
    const bodyBuffer =
      Buffer.isBuffer(req.rawBody) ? req.rawBody :
        Buffer.isBuffer(req.body) ? req.body :
          Buffer.from(
            typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? null),
            "utf8"
          );

    const sizeBytes = bodyBuffer.byteLength;

    // Extract source information from various headers
    // Priority: Origin (CORS), Referer (browser), X-Forwarded-Host (proxy), User-Agent (fallback identifier)
    // Note: Most webhook providers don't send Origin/Referer since these are server-to-server calls
    const sourceUrl = 
      req.get("origin") ?? 
      req.get("referer") ?? 
      req.get("x-webhook-source") ?? // Custom header some providers use
      "";
    const destinationUrl = buildDestinationUrl(req);

    // Store the complete webhook request
    const event = await EventModel.create({
      endpoint_id: endpoint._id,
      recieved_at: new Date(),
      original_url: destinationUrl,
      source_url: sourceUrl,
      method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: bodyBuffer,
      source_ip: req.ip,
      user_agent: req.get("user-agent"),
      size_bytes: sizeBytes
    });

    // Queue for delivery (fire and forget - don't block the response)
    deliveriesService.handleEvent(event).catch((err) => {
      console.error("[EventsService] Failed to queue event for delivery:", err);
    });

    return event;
  },

  /**
   * Lists events for a specific endpoint with pagination.
   *
   * Events are sorted by received time (newest first).
   *
   * @param endpointId - Public ID of the endpoint (end_...)
   * @param limit - Maximum number of events to return (default: 10, max: 50)
   * @param offset - Number of events to skip (default: 0)
   * @returns Paginated list of events with has_next indicator
   */
  listEventsByEndpointId: async (endpointId: string, limit?: unknown, offset?: unknown) => {
    const parsedEndpointId = endpointIdSchema.parse(endpointId);
    const parsed = listSchema.parse({ limit, offset });

    const endpoint = await EndpointModel.findOne(
      { public_id: parsedEndpointId },
      { _id: 1, public_id: 1 }
    );
    if (!endpoint) {
      return { events: [], has_next: false, limit: parsed.limit, offset: parsed.offset };
    }

    // Fetch one extra to determine if there are more pages
    const docs = await EventModel.find({ endpoint_id: endpoint._id })
      .sort({ recieved_at: -1, _id: -1 })
      .skip(parsed.offset)
      .limit(parsed.limit + 1);

    const has_next = docs.length > parsed.limit;

    // Transform events for HTTP response (decode body, extract content type, etc.)
    const events = docs.slice(0, parsed.limit).map((doc) =>
      eventToHttpResponse({ ...doc.toObject(), endpoint_id: endpoint.public_id })
    );

    return { events, has_next, limit: parsed.limit, offset: parsed.offset };
  },

  /**
   * Retrieves a single event by ID.
   *
   * @param id - Public ID of the event (evt_...)
   * @returns The event document formatted for HTTP response
   * @throws HttpError(404) if event doesn't exist
   */
  getEvent: async (id: string) => {
    const parsedId = eventIdSchema.parse(id);
    const doc = await EventModel.findOne({ public_id: parsedId })
      .populate("endpoint_id", "public_id -_id")
      .exec();
    if (!doc) {
      throw httpError(404, "event_not_found");
    }

    const endpointPublicId = (doc.endpoint_id as { public_id?: string } | null)?.public_id;

    return eventToHttpResponse({ ...doc.toObject(), endpoint_id: endpointPublicId });
  },
};
