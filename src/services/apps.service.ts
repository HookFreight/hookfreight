import mongoose from "mongoose";
import { z } from "zod";

import { AppModel } from "../models/App";
import { EndpointModel } from "../models/Endpoint";
import { EventModel } from "../models/Event";

const MAX_LIST_LIMIT = 1000;
const DELETE_CHUNK_SIZE = 1000;

const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => mongoose.isValidObjectId(v), { message: "App ID not valid", });

const appNameSchema = z.string().trim().min(1).max(200);

const appDescriptionSchema = z.string().trim().max(5_000);

const createAppSchema = z.preprocess(
  (v) => (v == null ? {} : v),
  z.object({
    name: appNameSchema,
    description: appDescriptionSchema.optional().default("")
  })
);

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

const listAppsSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .default(10)
    .transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
  offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

export const appsService = {
  listApps: async (limit?: unknown, offset?: unknown) => {
    const parsedParams = listAppsSchema.parse({ limit, offset });
    const docs = await AppModel.find()
      .skip(parsedParams.offset)
      .limit(parsedParams.limit + 1);

    const has_next = docs.length > parsedParams.limit;
    const apps = docs.slice(0, parsedParams.limit).map((app) => app.toJSON());

    return { apps, has_next, limit: parsedParams.limit, offset: parsedParams.offset };
  },

  createApp: async (body: unknown) => {
    const parsedBody = createAppSchema.parse(body);
    const app = await AppModel.create(parsedBody);
    return app.toJSON();
  },

  getApp: async (id: string) => {
    const parsedId = objectIdSchema.parse(id);
    const app = await AppModel.findById(parsedId);
    return app?.toJSON() ?? null;
  },

  updateApp: async (id: string, body: unknown) => {
    const parsedId = objectIdSchema.parse(id);
    const parsedBody = updateAppSchema.parse(body);
    const app = await AppModel.findByIdAndUpdate(parsedId, parsedBody, { new: true });
    return app?.toJSON() ?? null;
  },

  deleteApp: async (id: string) => {
    const parsedId = objectIdSchema.parse(id);

    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // Delete app first to confirm it exists (and to return it)
        const deletedApp = await AppModel.findOneAndDelete({ _id: parsedId }, { session });
        if (!deletedApp) return null;

        // Stream endpoint ids and delete events in chunks to avoid huge distinct arrays
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

        if (batch.length) {
          const r = await EventModel.deleteMany(
            { endpoint_id: { $in: batch } },
            { session }
          );
          deletedEvents += r.deletedCount ?? 0;
        }

        // Delete endpoints after events
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