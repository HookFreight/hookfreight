import {Router} from "express";
import { eventsController } from "../controllers/events.controller";

export function eventsRouter(): Router {
  const router = Router();
  router.get("/:id", eventsController.getEvent);
  router.get("/:id/deliveries", eventsController.getDeliveriesByEventId);
  return router;
}