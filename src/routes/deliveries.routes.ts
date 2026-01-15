import { Router } from "express";
import { deliveriesController } from "../controllers/deliveries.controller";

export function deliveriesRouter(): Router {
    const router = Router();

    router.get("/queue/stats", deliveriesController.getQueueStats);
    router.get("/event/:eventId", deliveriesController.getByEventId);
    router.post("/event/:eventId/retry", deliveriesController.retry);

    return router;
}

