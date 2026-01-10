import express from "express";
import { config } from "./config";
import { apiV1Router } from "./routes"; 
import { requestLogger } from "./middleware/request-logger";
import { notFound } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(express.json({ limit: config.HOOKFREIGHT_MAX_BODY_BYTES }));
  app.use("/api/v1", apiV1Router());
  app.use(notFound);
  app.use(errorHandler);

  return app;
}


