/**
 * @fileoverview Endpoints API routes.
 *
 * Defines routes for Endpoint CRUD operations.
 *
 * @license Apache-2.0
 */

import { Router } from "express";
import { endpointsController } from "../controllers/endpoints.controller";

/**
 * Creates the endpoints router.
 *
 * Routes:
 * - POST   /api/v1/endpoints           - Create a new endpoint
 * - GET    /api/v1/endpoints/:id       - Get endpoint by ID
 * - PUT    /api/v1/endpoints/:id       - Update endpoint
 * - DELETE /api/v1/endpoints/:id       - Delete endpoint
 * - GET    /api/v1/endpoints/:id/events - List events for an endpoint
 *
 * @returns Configured Express Router
 */
export function endpointsRouter(): Router {
  const router = Router();

  router.post("/", endpointsController.createEndpoint);
  router.get("/:id", endpointsController.getEndpoint);
  router.put("/:id", endpointsController.updateEndpoint);
  router.delete("/:id", endpointsController.deleteEndpoint);
  router.get("/:id/events", endpointsController.listEventsByEndpointId);

  return router;
}
