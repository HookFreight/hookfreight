import { Router } from "express";
import { testRouter } from "./test.routes";
import { appsRouter } from "./apps.routes";
import { deliveriesRouter } from "./deliveries.routes";
import { endpointsRouter } from "./endpoints.routes";
import { eventsRouter } from "./events.routes";

export function apiV1Router(): Router {
    const router = Router();
    router.use("/test", testRouter());
    router.use("/apps", appsRouter());
    router.use("/deliveries", deliveriesRouter());
    router.use("/endpoints", endpointsRouter());
    router.use("/events", eventsRouter());
    return router;
}
