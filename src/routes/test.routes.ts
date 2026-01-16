/**
 * @fileoverview Test API routes.
 *
 * Provides simple endpoints for health checks and testing.
 *
 * @license Apache-2.0
 */

import { Router } from "express";
import { testController } from "../controllers/test.controller";

/**
 * Creates the test router.
 *
 * Routes:
 * - GET  /api/v1/test - Health check (returns "Hello, world!")
 * - POST /api/v1/test - Echo endpoint (logs body, returns confirmation)
 *
 * @returns Configured Express Router
 */
export function testRouter(): Router {
  const router = Router();

  router.get("/", testController.getTest);
  router.post("/", testController.postTest);

  return router;
}
