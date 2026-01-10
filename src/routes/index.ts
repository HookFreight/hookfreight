import { Router } from "express";
import { testRouter } from "./test.routes";
import { appsRouter } from "./apps.routes";
import { endpointsRouter } from "./endpoints.routes";

export function apiV1Router(): Router {
    const router = Router();
    router.use("/test", testRouter());
    router.use("/apps", appsRouter());
    router.use("/endpoints", endpointsRouter());
    return router;
}
