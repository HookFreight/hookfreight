import { Router } from "express";
import { appsController } from "../controllers/apps.controller";
import { endpointsController } from "../controllers/endpoints.controller";

export function appsRouter(): Router {
  const router = Router();
  router.post("/", appsController.createApp);
  router.get("/", appsController.listApps);
  router.get("/:id", appsController.getApp);
  router.put("/:id", appsController.updateApp);
  router.delete("/:id", appsController.deleteApp);
  router.get("/:id/endpoints", appsController.listEndpointsByAppId);
  return router;
}


