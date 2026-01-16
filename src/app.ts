/**
 * @fileoverview Express application factory for HookFreight.
 *
 * Creates and configures the Express application with all middleware and routes.
 * Separating app creation from server startup enables easier testing.
 *
 * @license Apache-2.0
 */

import express from "express";
import { config } from "./config";
import { apiV1Router } from "./routes";
import { ingestRouter } from "./routes/ingest.routes";
import { requestLogger } from "./middleware/request-logger";
import { notFound } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";

/**
 * Creates and configures the Express application.
 *
 * Middleware order:
 * 1. Request logging (captures all requests)
 * 2. Ingest routes (webhook receiver, uses raw body parser)
 * 3. JSON body parser (for API routes)
 * 4. API v1 routes
 * 5. 404 handler
 * 6. Global error handler
 *
 * @returns Configured Express application instance
 */
export function createApp(): express.Express {
  const app = express();

  // Disable x-powered-by header for security
  app.disable("x-powered-by");

  // Log all incoming requests with timing
  app.use(requestLogger);

  // Webhook ingestion routes (mounted at root, uses raw body middleware)
  app.use("/", ingestRouter());

  // Parse JSON bodies for API routes
  app.use(express.json({ limit: config.HOOKFREIGHT_MAX_BODY_BYTES }));

  // Mount API v1 routes
  app.use("/api/v1", apiV1Router());

  // Handle 404 for unmatched routes
  app.use(notFound);

  // Global error handler
  app.use(errorHandler);

  return app;
}
