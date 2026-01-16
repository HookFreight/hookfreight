/**
 * @fileoverview Events controller - HTTP request handlers for Event operations.
 *
 * Handles:
 * - Webhook ingestion (POST /:hook_token)
 * - Event retrieval (GET /api/v1/events/:id)
 * - Delivery listing (GET /api/v1/events/:id/deliveries)
 *
 * @license Apache-2.0
 */

import type { Request, Response } from "express";
import { eventsService } from "../services/events.service";
import { deliveriesService } from "../services/deliveries.service";

/**
 * Controller for Event operations.
 */
export const eventsController = {
  /**
   * POST /:hook_token (and other methods)
   *
   * Webhook ingestion endpoint - captures incoming webhooks.
   * This is the primary entry point for external webhook providers.
   *
   * The hook_token in the URL identifies which endpoint receives the webhook.
   * Stores the complete request and queues it for delivery.
   */
  createEvent: async (req: Request, res: Response) => {
    await eventsService.createEvent(req);
    res.status(200).json({ message: "event_created", data: null });
  },

  /**
   * GET /api/v1/events/:id
   *
   * Retrieves a single event by ID.
   * Returns the full event data including decoded body.
   * Throws 404 via service if event not found.
   */
  getEvent: async (req: Request, res: Response) => {
    const event = await eventsService.getEvent(req.params.id);
    res.status(200).json({ message: "event_retrieved", data: event });
  },

  /**
   * GET /api/v1/events/:id/deliveries
   *
   * Lists all delivery attempts for an event.
   * Includes both successful and failed deliveries.
   * Query params: limit, offset
   */
  getDeliveriesByEventId: async (req: Request, res: Response) => {
    const deliveries = await deliveriesService.getDeliveriesByEventId(req.params.id, req.query.limit, req.query.offset);
    res.status(200).json({ message: "deliveries_listed", data: deliveries });
  },
};
