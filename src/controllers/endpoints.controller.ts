/**
 * @fileoverview Endpoints controller - HTTP request handlers for Endpoint operations.
 *
 * Handles all /api/v1/endpoints routes by delegating to the endpoints service.
 * Responsible for:
 * - Extracting request parameters and body
 * - Calling appropriate service methods
 * - Formatting HTTP responses
 *
 * @license Apache-2.0
 */

import type { Request, Response } from "express";
import { endpointsService } from "../services/endpoints.service";
import { eventsService } from "../services/events.service";

/**
 * Controller for Endpoint CRUD operations.
 *
 * All handlers follow the pattern:
 * 1. Extract data from request
 * 2. Call service method
 * 3. Return JSON response with status and data
 */
export const endpointsController = {
  /**
   * POST /api/v1/endpoints
   *
   * Creates a new endpoint.
   * Body: { name, app_id, forward_url?, forwarding_enabled?, ... }
   * Returns the created endpoint including the generated hook_token.
   */
  createEndpoint: async (req: Request, res: Response) => {
    const endpoint = await endpointsService.createEndpoint(req.body);
    res.status(201).json({ message: "endpoint_created", data: endpoint });
  },

  /**
   * GET /api/v1/endpoints/:id
   *
   * Retrieves a single endpoint by ID.
   * Throws 404 via service if endpoint not found.
   */
  getEndpoint: async (req: Request, res: Response) => {
    const endpoint = await endpointsService.getEndpoint(req.params.id);
    res.status(200).json({ message: "endpoint_retrieved", data: endpoint });
  },

  /**
   * PUT /api/v1/endpoints/:id
   *
   * Updates an existing endpoint.
   * Body: Any updatable endpoint fields.
   * Throws 404 via service if endpoint not found.
   */
  updateEndpoint: async (req: Request, res: Response) => {
    const endpoint = await endpointsService.updateEndpoint(req.params.id, req.body);
    res.status(200).json({ message: "endpoint_updated", data: endpoint });
  },

  /**
   * DELETE /api/v1/endpoints/:id
   *
   * Deletes an endpoint.
   * Throws 404 via service if endpoint not found.
   */
  deleteEndpoint: async (req: Request, res: Response) => {
    const deleted = await endpointsService.deleteEndpoint(req.params.id);
    res.status(200).json({ message: "endpoint_deleted", data: deleted });
  },

  /**
   * GET /api/v1/endpoints/:id/events
   *
   * Lists events received by an endpoint.
   * Query params: limit, offset
   */
  listEventsByEndpointId: async (req: Request, res: Response) => {
    const events = await eventsService.listEventsByEndpointId(req.params.id, req.query.limit, req.query.offset);
    res.status(200).json({ message: "events_listed", data: events });
  },
};
