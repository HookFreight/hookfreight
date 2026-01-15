import { Router } from "express";
import { deliveriesController } from "../controllers/deliveries.controller";

export function deliveriesRouter(): Router {
    const router = Router();

    router.get("/queue/stats", deliveriesController.getQueueStats);
    router.post("/:deliveryId/retry", deliveriesController.retry);

    return router;
}
