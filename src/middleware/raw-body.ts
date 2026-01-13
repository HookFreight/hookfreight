import express from "express";
import type { Request, RequestHandler } from "express";
import { config } from "../config";

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
 * Captures raw bytes for ingest routes **without JSON re-serialization**.
 *
 * IMPORTANT:
 * - Mount this ONLY on ingest routes (e.g. webhook receiver endpoints).
 * - Mount it BEFORE any `express.json()` / `express.urlencoded()` middleware on that route.
 */
export const rawBody: RequestHandler = express.raw({
  type: "*/*",
  limit: config.HOOKFREIGHT_MAX_BODY_BYTES,
  verify: (req, _res, buf) => {
    (req as Request).rawBody = buf;
  }
});


