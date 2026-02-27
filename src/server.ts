/**
 * @fileoverview Application entry point for Hookfreight.
 *
 * Bootstraps the application by:
 * 1. Connecting to MongoDB
 * 2. Initializing the delivery queue system
 * 3. Starting the HTTP server
 * 4. Setting up graceful shutdown handlers
 *
 * @license Apache-2.0
 */

import { createApp } from "./app";
import { config } from "./config";
import { connectMongo } from "./db/mongo";
import { deliveriesService } from "./services/deliveries.service";

/**
 * Main application bootstrap function.
 *
 * Initializes all services and starts the HTTP server.
 * Registers signal handlers for graceful shutdown on SIGTERM/SIGINT.
 */
async function main(): Promise<void> {
  // Connect to MongoDB before accepting requests
  await connectMongo();

  // Initialize the BullMQ delivery queue and worker
  deliveriesService.initialize();

  // Create and start the Express application
  const app = createApp();

  const server = app.listen(config.HOOKFREIGHT_PORT, config.HOOKFREIGHT_HOST, () => {
    console.log(
      `Hookfreight listening on http://${config.HOOKFREIGHT_HOST}:${config.HOOKFREIGHT_PORT} (base: ${config.HOOKFREIGHT_BASE_URL})`
    );
  });

  /**
   * Handles graceful shutdown when receiving termination signals.
   * Closes HTTP server and delivery queue before exiting.
   *
   * @param signal - The signal that triggered shutdown (SIGTERM or SIGINT)
   */
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new HTTP connections
    server.close(() => {
      console.log("HTTP server closed");
    });

    // Gracefully close the delivery queue and worker
    await deliveriesService.shutdown();

    process.exit(0);
  };

  // Register shutdown handlers for container orchestration (SIGTERM) and Ctrl+C (SIGINT)
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Start the application
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
