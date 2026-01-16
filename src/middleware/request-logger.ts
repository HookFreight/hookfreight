/**
 * @fileoverview Request logging middleware.
 *
 * Logs all incoming HTTP requests with method, path, status code,
 * and response time in milliseconds.
 *
 * @license Apache-2.0
 */

import type { NextFunction, Request, Response } from "express";

/**
 * Logs HTTP requests with timing information.
 *
 * Attaches a listener to the response 'finish' event to capture
 * the final status code and calculate request duration.
 *
 * Log format: `{METHOD} {PATH} -> {STATUS} ({DURATION}ms)`
 *
 * @example
 * // Output: POST /abc123def456 -> 200 (15ms)
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log after response is sent
  res.on("finish", () => {
    const ms = Date.now() - start;
    // Keep it minimal; log level control can be added later
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });

  next();
}
