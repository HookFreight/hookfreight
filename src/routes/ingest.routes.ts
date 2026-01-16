/**
 * @fileoverview Webhook ingestion routes.
 *
 * Handles incoming webhook requests at the root path.
 * Uses raw body middleware to capture the exact request payload.
 *
 * @license Apache-2.0
 */

import { Router } from "express";
import { eventsController } from "../controllers/events.controller";
import { rawBody } from "../middleware/raw-body";

/**
 * Creates the webhook ingestion router.
 *
 * Routes:
 * - ANY /:hook_token - Receives webhooks for the specified endpoint
 *
 * The hook_token is a unique identifier generated when an endpoint is created.
 * Webhook providers should be configured to send requests to:
 *   http://your-host/{hook_token}
 *
 * Accepts any HTTP method (GET, POST, PUT, PATCH) to support various providers.
 *
 * @returns Configured Express Router
 */
export function ingestRouter(): Router {
  const router = Router();

  // Use rawBody middleware to capture unparsed request body
  // This is important for webhook signature verification
  router.all("/:hook_token", rawBody, eventsController.createEvent);

  return router;
}
