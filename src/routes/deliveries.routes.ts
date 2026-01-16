/**
 * @fileoverview Deliveries API routes.
 *
 * Defines routes for delivery operations and queue monitoring.
 *
 * @license Apache-2.0
 */

import { Router } from "express";
import { deliveriesController } from "../controllers/deliveries.controller";

/**
 * Creates the deliveries router.
 *
 * Routes:
 * - GET  /api/v1/deliveries/queue/stats    - Get queue statistics
 * - POST /api/v1/deliveries/:deliveryId/retry - Manually retry a delivery
 *
 * Note: Listing deliveries is done via the events router
 * (GET /api/v1/events/:id/deliveries)
 *
 * @returns Configured Express Router
 */
export function deliveriesRouter(): Router {
  const router = Router();

  // Queue stats endpoint (placed before :deliveryId to avoid route conflict)
  router.get("/queue/stats", deliveriesController.getQueueStats);

  // Manual retry endpoint
  router.post("/:deliveryId/retry", deliveriesController.retry);

  return router;
}
