import {Router} from "express";
import { eventsController } from "../controllers/events.controller";

export function eventsRouter(): Router {
  const router = Router();
  router.get("/:id", eventsController.getEvent);
  return router;
}