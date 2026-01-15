import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";

export type HttpError = Error & { status?: number; details?: unknown; code?: string };

export function httpError(status: number, message: string, details?: unknown): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  if (details !== undefined) err.details = details;
  return err;
}

// Event Structure Functions

function decodeBody(body: Buffer, encoding?: string | null): Buffer {
  const enc = (encoding ?? "").toLowerCase().trim();

  if (!enc || enc === "identity") return body;
  if (enc.includes("gzip")) return gunzipSync(body);
  if (enc.includes("deflate")) return inflateSync(body);
  if (enc.includes("br")) return brotliDecompressSync(body);

  // Unknown encoding, return raw bytes
  return body;
}

function looksJson(contentType?: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.includes("application/json") || ct.includes("+json");
}

function firstHeaderValue(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export type EventHttpResponse = {
  id: string;
  endpoint_id: unknown;
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
 * Converts various Buffer representations back into a real Buffer.
 * Handles: actual Buffer, MongoDB Binary, { type: 'Buffer', data: [...] } objects.
 */
export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;

  // MongoDB Binary / node-mongodb-native Binary has a `buffer` property
  if (value && typeof value === "object" && "buffer" in value && Buffer.isBuffer((value as any).buffer)) {
    return (value as any).buffer;
  }

  // JSON-serialized Buffer: { type: 'Buffer', data: number[] }
  if (
    value &&
    typeof value === "object" &&
    (value as any).type === "Buffer" &&
    Array.isArray((value as any).data)
  ) {
    return Buffer.from((value as any).data);
  }

  // Uint8Array or ArrayBuffer
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  // string fallback (maybe base64 or raw)
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  return Buffer.alloc(0);
}

/**
 * Normalizes an Event document/object into an API response shape.
 * Includes best-effort decoding + JSON parsing of the stored raw Buffer body.
 */
export function eventToHttpResponse(event: any): EventHttpResponse {
  const headers: any = event?.headers ?? {};

  const ct = firstHeaderValue(headers?.["content-type"]);
  const ce = firstHeaderValue(headers?.["content-encoding"]);

  const rawBody: Buffer = toBuffer(event?.body);

  let decoded = rawBody;
  try {
    decoded = decodeBody(rawBody, ce ?? null);
  } catch {
    decoded = rawBody;
  }

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

  const sourceUrlRaw = typeof event?.source_url === "string" ? event.source_url.trim() : "";

  return {
    id: event?._id?.toString?.() ?? event?.id,
    endpoint_id: event?.endpoint_id,
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


