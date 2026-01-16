/**
 * @fileoverview Apps API routes.
 *
 * Defines routes for App CRUD operations.
 *
 * @license Apache-2.0
 */

import { Router } from "express";
import { appsController } from "../controllers/apps.controller";

/**
 * Creates the apps router.
 *
 * Routes:
 * - POST   /api/v1/apps              - Create a new app
 * - GET    /api/v1/apps              - List all apps
 * - GET    /api/v1/apps/:id          - Get app by ID
 * - PUT    /api/v1/apps/:id          - Update app
 * - DELETE /api/v1/apps/:id          - Delete app and all associated data
 * - GET    /api/v1/apps/:id/endpoints - List endpoints for an app
 *
 * @returns Configured Express Router
 */
export function appsRouter(): Router {
  const router = Router();

  router.post("/", appsController.createApp);
  router.get("/", appsController.listApps);
  router.get("/:id", appsController.getApp);
  router.put("/:id", appsController.updateApp);
  router.delete("/:id", appsController.deleteApp);
  router.get("/:id/endpoints", appsController.listEndpointsByAppId);

  return router;
}
