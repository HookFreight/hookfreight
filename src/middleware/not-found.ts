/**
 * @fileoverview 404 Not Found handler middleware.
 *
 * Catches requests that don't match any defined route
 * and returns a consistent JSON 404 response.
 *
 * @license Apache-2.0
 */

import type { Request, Response } from "express";

/**
 * Handles requests to undefined routes.
 *
 * Should be registered after all route handlers but before
 * the error handler middleware.
 *
 * @param req - Express request
 * @param res - Express response
 */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "not_found" });
}
