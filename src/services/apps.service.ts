/**
 * @fileoverview Apps service - business logic for App management.
 *
 * Provides CRUD operations for Apps with validation using Zod schemas.
 * Handles cascading deletes for associated Endpoints and Events.
 *
 * @license Apache-2.0
 */

import mongoose from "mongoose";
import { z } from "zod";

import { AppModel } from "../models/App";
import { EndpointModel } from "../models/Endpoint";
import { EventModel } from "../models/Event";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of items to return in a list query */
const MAX_LIST_LIMIT = 1000;

/** Number of endpoints to process per batch during cascade delete */
const DELETE_CHUNK_SIZE = 1000;

// ============================================================================
// Validation Schemas
// ============================================================================

/** Validates MongoDB ObjectId strings */
const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => mongoose.isValidObjectId(v), { message: "App ID not valid" });

/** Validates app name (1-200 characters) */
const appNameSchema = z.string().trim().min(1).max(200);

/** Validates app description (max 5000 characters) */
const appDescriptionSchema = z.string().trim().max(5_000);

/** Schema for creating a new app */
const createAppSchema = z.preprocess(
  (v) => (v == null ? {} : v),
  z.object({
    name: appNameSchema,
    description: appDescriptionSchema.optional().default("")
  })
);

/** Schema for updating an existing app (at least one field required) */
const updateAppSchema = z.preprocess(
  (v) => (v == null ? {} : v),
  z
    .object({
      name: appNameSchema.optional(),
      description: appDescriptionSchema.optional()
    })
    .refine((val) => val.name !== undefined || val.description !== undefined, {
      message: "Provide app name or description for update"
    })
);

/** Schema for list pagination parameters */
const listAppsSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .default(10)
    .transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
  offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Apps service providing CRUD operations.
 *
 * All methods validate input using Zod schemas and throw on invalid data.
 */
export const appsService = {
  /**
   * Lists all apps with pagination.
   *
   * @param limit - Maximum number of apps to return (default: 10, max: 1000)
   * @param offset - Number of apps to skip (default: 0)
   * @returns Paginated list of apps with has_next indicator
   */
  listApps: async (limit?: unknown, offset?: unknown) => {
    const parsedParams = listAppsSchema.parse({ limit, offset });

    // Fetch one extra to determine if there are more pages
    const docs = await AppModel.find()
      .skip(parsedParams.offset)
      .limit(parsedParams.limit + 1);

    const has_next = docs.length > parsedParams.limit;
    const apps = docs.slice(0, parsedParams.limit).map((app) => app.toJSON());

    return { apps, has_next, limit: parsedParams.limit, offset: parsedParams.offset };
  },

  /**
   * Creates a new app.
   *
   * @param body - Request body containing name and optional description
   * @returns The created app document
   * @throws ZodError if validation fails
   */
  createApp: async (body: unknown) => {
    const parsedBody = createAppSchema.parse(body);
    const app = await AppModel.create(parsedBody);
    return app.toJSON();
  },

  /**
   * Retrieves a single app by ID.
   *
   * @param id - MongoDB ObjectId of the app
   * @returns The app document or null if not found
   * @throws ZodError if ID is invalid
   */
  getApp: async (id: string) => {
    const parsedId = objectIdSchema.parse(id);
    const app = await AppModel.findById(parsedId);
    return app?.toJSON() ?? null;
  },

  /**
   * Updates an existing app.
   *
   * @param id - MongoDB ObjectId of the app
   * @param body - Fields to update (name and/or description)
   * @returns The updated app document or null if not found
   * @throws ZodError if validation fails
   */
  updateApp: async (id: string, body: unknown) => {
    const parsedId = objectIdSchema.parse(id);
    const parsedBody = updateAppSchema.parse(body);
    const app = await AppModel.findByIdAndUpdate(parsedId, parsedBody, { new: true });
    return app?.toJSON() ?? null;
  },

  /**
   * Deletes an app and all associated endpoints and events.
   *
   * Uses a MongoDB transaction to ensure atomicity.
   * Processes endpoint deletions in chunks to avoid memory issues.
   *
   * @param id - MongoDB ObjectId of the app
   * @returns Object with deleted counts or null if app not found
   * @throws ZodError if ID is invalid
   */
  deleteApp: async (id: string) => {
    const parsedId = objectIdSchema.parse(id);

    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // Delete app first to confirm it exists (and to return it)
        const deletedApp = await AppModel.findOneAndDelete({ _id: parsedId }, { session });
        if (!deletedApp) return null;

        // Stream endpoint ids and delete events in chunks to avoid huge arrays
        let deletedEvents = 0;

        const cursor = EndpointModel.find(
          { app_id: parsedId },
          { _id: 1 },
          { session }
        ).cursor();

        let batch: mongoose.Types.ObjectId[] = [];

        for await (const doc of cursor) {
          batch.push(doc._id);

          if (batch.length >= DELETE_CHUNK_SIZE) {
            const r = await EventModel.deleteMany(
              { endpoint_id: { $in: batch } },
              { session }
            );
            deletedEvents += r.deletedCount ?? 0;
            batch = [];
          }
        }

        // Process remaining endpoints in final batch
        if (batch.length) {
          const r = await EventModel.deleteMany(
            { endpoint_id: { $in: batch } },
            { session }
          );
          deletedEvents += r.deletedCount ?? 0;
        }

        // Delete all endpoints after their events are removed
        const endpointsDeleteResult = await EndpointModel.deleteMany(
          { app_id: parsedId },
          { session }
        );

        return {
          app: deletedApp.toJSON(),
          deleted_endpoints: endpointsDeleteResult.deletedCount ?? 0,
          deleted_events: deletedEvents,
        };
      });
    } finally {
      await session.endSession();
    }
  },
};
