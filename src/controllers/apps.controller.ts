/**
 * @fileoverview Apps controller - HTTP request handlers for App endpoints.
 *
 * Handles all /api/v1/apps routes by delegating to the apps service.
 * Responsible for:
 * - Extracting request parameters and body
 * - Calling appropriate service methods
 * - Formatting HTTP responses
 *
 * @license Apache-2.0
 */

import type { Request, Response } from "express";
import { appsService } from "../services/apps.service";
import { endpointsService } from "../services/endpoints.service";

/**
 * Controller for App CRUD operations.
 *
 * All handlers follow the pattern:
 * 1. Extract data from request
 * 2. Call service method
 * 3. Return JSON response with status and data
 */
export const appsController = {
  /**
   * GET /api/v1/apps
   *
   * Lists all apps with pagination.
   * Query params: limit, offset
   */
  listApps: async (req: Request, res: Response) => {
    const apps = await appsService.listApps(req.query.limit, req.query.offset);
    res.status(200).json({ message: "apps_listed", data: apps });
  },

  /**
   * POST /api/v1/apps
   *
   * Creates a new app.
   * Body: { name: string, description?: string }
   */
  createApp: async (req: Request, res: Response) => {
    const app = await appsService.createApp(req.body);
    res.status(201).json({ message: "app_created", data: app });
  },

  /**
   * GET /api/v1/apps/:id
   *
   * Retrieves a single app by ID.
   * Returns 404 if app not found.
   */
  getApp: async (req: Request, res: Response) => {
    const app = await appsService.getApp(req.params.id);
    if (!app) {
      res.status(404).json({ message: "app_not_found", data: null });
      return;
    }
    res.status(200).json({ message: "app_retrieved", data: app });
  },

  /**
   * PUT /api/v1/apps/:id
   *
   * Updates an existing app.
   * Body: { name?: string, description?: string }
   * Returns 404 if app not found.
   */
  updateApp: async (req: Request, res: Response) => {
    const app = await appsService.updateApp(req.params.id, req.body);
    if (!app) {
      res.status(404).json({ message: "app_not_found", data: null });
      return;
    }
    res.status(200).json({ message: "app_updated", data: app });
  },

  /**
   * DELETE /api/v1/apps/:id
   *
   * Deletes an app and all associated endpoints/events.
   * Returns 404 if app not found.
   */
  deleteApp: async (req: Request, res: Response) => {
    const deleted = await appsService.deleteApp(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: "app_not_found", data: null });
      return;
    }
    res.status(200).json({ message: "app_deleted", data: deleted });
  },

  /**
   * GET /api/v1/apps/:id/endpoints
   *
   * Lists endpoints belonging to an app.
   * Query params: limit, offset
   */
  listEndpointsByAppId: async (req: Request, res: Response) => {
    const endpoints = await endpointsService.listEndpointsByAppId(req.params.id, req.query.limit, req.query.offset);
    res.status(200).json({ message: "endpoints_listed", data: endpoints });
  },
};
