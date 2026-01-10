import { Router } from "express";
import { testController } from "../controllers/test.controller";

export function testRouter(): Router {
    const router = Router();
    router.get("/", testController.getTest);
    return router;
  }
  