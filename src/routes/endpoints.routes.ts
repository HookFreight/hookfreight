import { Router } from "express";
import { endpointsController } from "../controllers/endpoints.controller";

export function endpointsRouter(): Router {
  const router = Router();
  router.post("/", endpointsController.createEndpoint);
  router.get("/:id", endpointsController.getEndpoint);
  router.put("/:id", endpointsController.updateEndpoint);
  router.delete("/:id", endpointsController.deleteEndpoint);
  router.get("/:id/events", endpointsController.listEventsByEndpointId);
  return router;
}


