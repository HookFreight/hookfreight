import {Router} from "express";
import { eventsController } from "../controllers/events.controller";
import { rawBody } from "../middleware/raw-body";

export function ingestRouter(): Router {
  const router = Router();
  router.all("/:hook_token", rawBody, eventsController.createEvent);
  return router;
}