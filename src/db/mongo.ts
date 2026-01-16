/**
 * @fileoverview MongoDB connection management.
 *
 * Provides functions to establish and terminate the MongoDB connection.
 * Uses Mongoose as the ODM layer.
 *
 * @license Apache-2.0
 */

import mongoose from "mongoose";
import { config } from "../config";

/**
 * Establishes a connection to MongoDB.
 *
 * Connects using the URI and database name from configuration.
 * Enables automatic index creation for all schemas.
 *
 * @returns Promise that resolves when the connection is established
 * @throws Error if the connection fails
 */
export async function connectMongo(): Promise<void> {
  await mongoose.connect(config.HOOKFREIGHT_MONGO_URI, {
    autoIndex: true,
    dbName: config.HOOKFREIGHT_MONGO_DB_NAME
  });
}

/**
 * Closes the MongoDB connection gracefully.
 *
 * Should be called during application shutdown to release resources.
 *
 * @returns Promise that resolves when disconnected
 */
export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
