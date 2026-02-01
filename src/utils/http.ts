/**
 * @fileoverview HTTP utility functions.
 *
 * Provides helpers for:
 * - Creating HTTP errors with status codes
 * - Buffer conversion and handling
 * - Response body parsing and decoding
 * - Transforming Event documents for API responses
 *
 * @license Apache-2.0
 */

import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";

// ============================================================================
// HTTP Error Helpers
// ============================================================================

/**
 * Custom error type with HTTP status code and optional details.
 */
export type HttpError = Error & { status?: number; details?: unknown; code?: string };

/**
 * Creates an HTTP error with a status code and message.
 *
 * Use this to throw errors that should result in specific HTTP status codes.
 *
 * @param status - HTTP status code (e.g., 404, 400, 500)
 * @param message - Error message for the response
 * @param details - Optional additional error details
 * @returns Error object with status property
 *
 * @example
 * throw httpError(404, "endpoint_not_found");
 * throw httpError(400, "validation_error", { field: "name" });
 */
export function httpError(status: number, message: string, details?: unknown): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  if (details !== undefined) err.details = details;
  return err;
}

// ============================================================================
// Body Decoding Helpers
// ============================================================================

/**
 * Decompresses a body buffer based on Content-Encoding header.
 *
 * Supports:
 * - gzip
 * - deflate
 * - br (Brotli)
 * - identity (no encoding, passthrough)
 *
 * @param body - Compressed body buffer
 * @param encoding - Content-Encoding header value
 * @returns Decompressed buffer (or original if unknown encoding)
 */
function decodeBody(body: Buffer, encoding?: string | null): Buffer {
  const enc = (encoding ?? "").toLowerCase().trim();

  if (!enc || enc === "identity") return body;
  if (enc.includes("gzip")) return gunzipSync(body);
  if (enc.includes("deflate")) return inflateSync(body);
  if (enc.includes("br")) return brotliDecompressSync(body);

  // Unknown encoding, return raw bytes
  return body;
}

/**
 * Checks if a Content-Type indicates JSON data.
 *
 * @param contentType - Content-Type header value
 * @returns True if content is JSON
 */
function looksJson(contentType?: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.includes("application/json") || ct.includes("+json");
}

/**
 * Extracts the first value from a header that may be a string or array.
 *
 * HTTP headers can have multiple values; this gets the first one.
 *
 * @param v - Header value (string, array, or undefined)
 * @returns First value or undefined
 */
function firstHeaderValue(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

// ============================================================================
// Buffer Conversion Helpers
// ============================================================================

/**
 * Converts various data types to a Buffer.
 *
 * Handles:
 * - Buffer (passthrough)
 * - Objects with .buffer property (Mongoose Binary)
 * - Serialized Buffer objects { type: "Buffer", data: [...] }
 * - Uint8Array
 * - Strings (UTF-8 encoded)
 *
 * @param value - Value to convert
 * @returns Buffer representation (empty buffer if conversion fails)
 */
export function toBuffer(value: unknown): Buffer {
  // Already a Buffer
  if (Buffer.isBuffer(value)) return value;

  // Mongoose Binary with nested buffer
  if (value && typeof value === "object" && "buffer" in value && Buffer.isBuffer((value as any).buffer)) {
    return (value as any).buffer;
  }

  // Serialized Buffer from JSON (MongoDB stores as { type: "Buffer", data: [...] })
  if (
    value &&
    typeof value === "object" &&
    (value as any).type === "Buffer" &&
    Array.isArray((value as any).data)
  ) {
    return Buffer.from((value as any).data);
  }

  // Uint8Array (from ArrayBuffer, etc.)
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  // String - encode as UTF-8
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  // Fallback to empty buffer
  return Buffer.alloc(0);
}

/**
 * Parses a buffer value into a JSON object or string.
 *
 * Attempts JSON parsing first, falls back to string representation.
 *
 * @param value - Buffer or buffer-like value
 * @returns Parsed JSON object, string, or null if empty
 */
export function parseBufferBody(value: unknown): unknown {
  const buffer = toBuffer(value);
  if (buffer.length === 0) return null;

  const str = buffer.toString("utf8");

  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

// ============================================================================
// Event Response Transformation
// ============================================================================

/**
 * Type definition for Event data formatted for HTTP responses.
 *
 * Differs from the raw Event model:
 * - body is decoded and parsed (not raw Buffer)
 * - content_type and content_encoding extracted from headers
 * - public_id mapped to id string
 */
export type EventHttpResponse = {
  id: string;
  endpoint_id: string;
  recieved_at: Date;
  method: string;
  original_url: string;
  path: string;
  query: unknown;
  headers: unknown;
  source_ip?: string;
  user_agent?: string;
  size_bytes: number;
  content_type: string | null;
  content_encoding: string | null;
  body: unknown | null;
  source_url?: string;
};

/**
 * Transforms a raw Event document into an HTTP response format.
 *
 * Performs:
 * - ID field normalization (public_id -> id)
 * - Body decompression (gzip, deflate, brotli)
 * - JSON parsing (if content type indicates JSON)
 * - Content-Type and Content-Encoding extraction
 *
 * @param event - Raw Event document from MongoDB
 * @returns Formatted event data for API response
 */
export function eventToHttpResponse(event: any): EventHttpResponse {
  const headers: any = event?.headers ?? {};
  const endpointIdRaw = event?.endpoint_id;
  const endpointId =
    (typeof endpointIdRaw === "string" && endpointIdRaw.startsWith("end_")) ?
      endpointIdRaw :
      (typeof endpointIdRaw?.public_id === "string" ? endpointIdRaw.public_id : "");
  const eventId =
    (typeof event?.public_id === "string" && event.public_id.startsWith("evt_")) ?
      event.public_id :
      (typeof event?.id === "string" && event.id.startsWith("evt_") ? event.id : "");

  // Extract content headers
  const ct = firstHeaderValue(headers?.["content-type"]);
  const ce = firstHeaderValue(headers?.["content-encoding"]);

  // Convert body to Buffer
  const rawBody: Buffer = toBuffer(event?.body);

  // Attempt to decompress if encoded
  let decoded = rawBody;
  try {
    decoded = decodeBody(rawBody, ce ?? null);
  } catch {
    // Decompression failed, use raw bytes
    decoded = rawBody;
  }

  // Attempt JSON parsing if content looks like JSON
  let body: unknown | null = null;
  const tryParse =
    looksJson(ct ?? null) || (decoded.length > 0 && (decoded[0] === 0x7b || decoded[0] === 0x5b)); // { or [

  if (tryParse && decoded.length > 0) {
    try {
      body = JSON.parse(decoded.toString("utf8"));
    } catch {
      body = null;
    }
  }

  // Clean up source_url (empty strings become undefined)
  const sourceUrlRaw = typeof event?.source_url === "string" ? event.source_url.trim() : "";

  return {
    id: eventId,
    endpoint_id: endpointId,
    recieved_at: event?.recieved_at,
    method: event?.method,
    original_url: event?.original_url,
    ...(sourceUrlRaw ? { source_url: sourceUrlRaw } : {}),
    path: event?.path,
    query: event?.query,
    headers,
    source_ip: event?.source_ip,
    user_agent: event?.user_agent,
    size_bytes: event?.size_bytes ?? rawBody.length,
    content_type: ct ?? null,
    content_encoding: ce ?? null,
    body
  };
}
