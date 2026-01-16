/**
 * @fileoverview Events API routes.
 *
 * Defines routes for Event retrieval and related operations.
 *
 * @license Apache-2.0
 */

import { Router } from "express";
import { eventsController } from "../controllers/events.controller";

/**
 * Creates the events router.
 *
 * Routes:
 * - GET /api/v1/events/:id           - Get event by ID
 * - GET /api/v1/events/:id/deliveries - List deliveries for an event
 *
 * Note: Event creation happens via the ingest router (POST /:hook_token),
 * not through this API router.
 *
 * @returns Configured Express Router
 */
export function eventsRouter(): Router {
  const router = Router();

  router.get("/:id", eventsController.getEvent);
  router.get("/:id/deliveries", eventsController.getDeliveriesByEventId);

  return router;
}
