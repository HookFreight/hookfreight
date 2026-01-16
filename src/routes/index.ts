/**
 * @fileoverview API v1 router factory.
 *
 * Aggregates all API route modules under the /api/v1 prefix.
 * Each resource has its own router file for maintainability.
 *
 * @license Apache-2.0
 */

import { Router } from "express";
import { testRouter } from "./test.routes";
import { appsRouter } from "./apps.routes";
import { deliveriesRouter } from "./deliveries.routes";
import { endpointsRouter } from "./endpoints.routes";
import { eventsRouter } from "./events.routes";

/**
 * Creates the main API v1 router.
 *
 * Route structure:
 * - /api/v1/test     - Health check and testing
 * - /api/v1/apps     - App management
 * - /api/v1/deliveries - Delivery operations
 * - /api/v1/endpoints  - Endpoint management
 * - /api/v1/events    - Event retrieval
 *
 * @returns Configured Express Router
 */
export function apiV1Router(): Router {
  const router = Router();

  router.use("/test", testRouter());
  router.use("/apps", appsRouter());
  router.use("/deliveries", deliveriesRouter());
  router.use("/endpoints", endpointsRouter());
  router.use("/events", eventsRouter());

  return router;
}
