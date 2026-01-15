import type { Request, Response, NextFunction } from "express";
import { deliveriesService } from "../services/deliveries.service";

export const deliveriesController = {
    retry: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { deliveryId } = req.params;
            await deliveriesService.retryDelivery(deliveryId);
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
