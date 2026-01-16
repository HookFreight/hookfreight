/**
 * @fileoverview Raw body capture middleware.
 *
 * Captures the raw, unparsed request body for webhook ingestion routes.
 * This is essential for:
 * - Storing the exact payload received
 * - Webhook signature verification (requires exact bytes)
 *
 * @license Apache-2.0
 */

import express from "express";
import type { Request, RequestHandler } from "express";
import { config } from "../config";

/**
 * Extends Express Request type to include rawBody property.
 */
declare module "express-serve-static-core" {
  interface Request {
    /**
     * Raw, unparsed request bytes captured by `rawBody` middleware.
     * Useful for webhook signature verification and storing the exact payload.
     */
    rawBody?: Buffer;
  }
}

/**
 * Middleware that captures raw request bytes.
 *
 * Uses express.raw() with a verify callback to store the raw buffer
 * on the request object before any parsing occurs.
 *
 * IMPORTANT:
 * - Mount this ONLY on ingest routes (webhook receiver endpoints)
 * - Mount it BEFORE any express.json() or express.urlencoded() middleware
 * - Respects HOOKFREIGHT_MAX_BODY_BYTES size limit
 *
 * @example
 * router.post('/:hook_token', rawBody, eventsController.createEvent);
 */
export const rawBody: RequestHandler = express.raw({
  // Accept any content type for webhook payloads
  type: "*/*",
  // Apply configured body size limit
  limit: config.HOOKFREIGHT_MAX_BODY_BYTES,
  // Store raw bytes on request before parsing
  verify: (req, _res, buf) => {
    (req as Request).rawBody = buf;
  }
});
