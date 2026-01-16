/**
 * @fileoverview Test controller - simple endpoints for testing and health checks.
 *
 * Provides basic endpoints for verifying the server is running
 * and for testing request/response handling.
 *
 * @license Apache-2.0
 */

import type { Request, Response } from "express";

/**
 * Controller for test endpoints.
 *
 * These endpoints are useful for:
 * - Health checks
 * - Verifying deployment
 * - Testing webhook forwarding
 */
export const testController = {
  /**
   * GET /api/v1/test
   *
   * Simple health check endpoint.
   * Returns a static message to confirm the server is running.
   */
  getTest: async (req: Request, res: Response) => {
    res.json({ message: "Hello, world!" });
  },

  /**
   * POST /api/v1/test
   *
   * Echo endpoint for testing POST requests.
   * Logs the request body and returns a confirmation.
   */
  postTest: async (req: Request, res: Response) => {
    console.log(req.body);
    res.json({ message: "Message received" });
  }
};
