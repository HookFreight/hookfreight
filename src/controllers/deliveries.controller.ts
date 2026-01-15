import type { Request, Response, NextFunction } from "express";
import { deliveriesService } from "../services/deliveries.service";

export const deliveriesController = {
    getByEventId: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { eventId } = req.params;
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

            const result = await deliveriesService.getDeliveriesByEventId(eventId, page, limit);
            res.json(result);
        } catch (error) {
            next(error);
        }
    },

    retry: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { eventId } = req.params;
            await deliveriesService.retryDelivery(eventId);
            res.json({ message: "Retry queued successfully" });
        } catch (error) {
            next(error);
        }
    },

    getQueueStats: async (_req: Request, res: Response, next: NextFunction) => {
        try {
            const stats = await deliveriesService.getQueueStats();
            res.json(stats);
        } catch (error) {
            next(error);
        }
    },
};

