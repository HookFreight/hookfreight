/**
 * @fileoverview Global error handler middleware.
 *
 * Catches all errors thrown in route handlers and formats them
 * as consistent JSON responses. Handles different error types:
 * - ZodError: Validation errors (400)
 * - HttpError: Custom HTTP errors with status codes
 * - Generic errors: Logged and returned as 500
 *
 * @license Apache-2.0
 */

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/**
 * Formats a ZodError into a structured API response.
 *
 * Extracts field paths, error codes, and messages from Zod issues.
 *
 * @param err - The ZodError to format
 * @returns Formatted error object for JSON response
 */
function formatZodError(err: ZodError) {
  return {
    message: "validation_error",
    errors: err.issues.map((i) => ({
      field: i.path.length ? i.path.join(".") : undefined,
      code: i.code,
      message: i.message,
      expected: "expected" in i ? i.expected : undefined,
      received: "received" in i ? i.received : undefined,
    })),
  };
}

/**
 * Custom HTTP error type with optional status code and details.
 */
type HttpError = Error & { status?: number; details?: unknown; code?: string };

/**
 * Express error handling middleware.
 *
 * Must be registered last in the middleware chain.
 * Handles:
 * - 413 Payload Too Large (from express.json())
 * - Zod validation errors (400)
 * - Custom HTTP errors (with status code)
 * - Unhandled errors (500, logged to console)
 *
 * @param err - The error thrown by a route handler
 * @param _req - Express request (unused)
 * @param res - Express response
 * @param _next - Express next function (unused)
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Handle express.json() body size limit errors
  if (typeof err === "object" && err && "type" in err && (err as any).type === "entity.too.large") {
    res.status(413).json({ message: "payload_too_large", data: null });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  // Handle custom HTTP errors and generic errors
  const httpErr = err as HttpError;
  const status = httpErr?.status ?? 500;

  // Don't expose internal error details in production (500 errors)
  const message =
    status === 500
      ? "an error occured, please try again later."
      : (httpErr?.message ?? "internal_error");

  // Log all errors for debugging
  console.error(err);

  res.status(status).json({
    message,
    data: httpErr?.details ?? null
  });
}
