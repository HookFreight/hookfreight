/**
 * @fileoverview Environment configuration module for Hookfreight.
 *
 * Loads and validates all environment variables using Zod schemas.
 * Configuration is parsed once at startup and exported as a typed object.
 *
 * @see {@link env.example} for available configuration options
 *
 * @license Apache-2.0
 */

import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file (if present)
dotenv.config();

/**
 * Zod schema defining all required and optional environment variables.
 * Each variable has sensible defaults for local development.
 */
const envSchema = z.object({
  /** Port number for the HTTP server */
  HOOKFREIGHT_PORT: z.coerce.number().default(3030),

  /** Host address to bind the server (0.0.0.0 for all interfaces) */
  HOOKFREIGHT_HOST: z.string().default("0.0.0.0"),

  /** Public base URL used for generating webhook URLs */
  HOOKFREIGHT_BASE_URL: z.string().default("http://localhost:3030"),

  /** MongoDB connection URI */
  HOOKFREIGHT_MONGO_URI: z.string().default("mongodb://localhost:27017/hookfreight"),

  /** MongoDB database name */
  HOOKFREIGHT_MONGO_DB_NAME: z.string().default("hookfreight"),

  /** Maximum allowed request body size in bytes (default: 1MB) */
  HOOKFREIGHT_MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),

  /** Redis connection URL for BullMQ job queue */
  HOOKFREIGHT_REDIS_URL: z.string().default("redis://localhost:6379"),

  /** Number of concurrent delivery workers */
  HOOKFREIGHT_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),

  /** Maximum retry attempts for failed deliveries */
  HOOKFREIGHT_QUEUE_MAX_RETRIES: z.coerce.number().int().positive().default(5),
});

/**
 * Typed configuration object inferred from the Zod schema.
 */
export type Config = z.infer<typeof envSchema>;

/**
 * Validated configuration object.
 * Throws a ZodError at startup if required variables are missing or invalid.
 */
export const config: Config = envSchema.parse(process.env);
