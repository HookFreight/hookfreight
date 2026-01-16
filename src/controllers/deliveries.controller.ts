/**
 * @fileoverview Deliveries controller - HTTP request handlers for Delivery operations.
 *
 * Handles:
 * - Manual retry requests (POST /api/v1/deliveries/:deliveryId/retry)
 * - Queue statistics (GET /api/v1/deliveries/queue/stats)
 *
 * @license Apache-2.0
 */

import type { Request, Response, NextFunction } from "express";
import { deliveriesService } from "../services/deliveries.service";

/**
 * Controller for Delivery operations.
 *
 * Uses explicit error handling with next() for async operations.
 */
export const deliveriesController = {
  /**
   * POST /api/v1/deliveries/:deliveryId/retry
   *
   * Manually retries a failed delivery.
   * Queues a new delivery attempt linked to the original.
   *
   * @throws Error if delivery or associated event not found
   */
  retry: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deliveryId } = req.params;
      await deliveriesService.retryDelivery(deliveryId);
      res.json({ message: "Retry queued successfully" });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/deliveries/queue/stats
   *
   * Returns current queue statistics.
   * Useful for monitoring delivery health.
   *
   * Response: { waiting, active, completed, failed, delayed }
   */
  getQueueStats: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await deliveriesService.getQueueStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
};
