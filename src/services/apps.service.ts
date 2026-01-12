import mongoose from "mongoose";
import { z } from "zod";
import { AppModel } from "../models/App";
import { EndpointModel } from "../models/Endpoint";

const MAX_LIST_LIMIT = 1000;

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
      const result = await session.withTransaction(async () => {

        const appDoc = await AppModel.findById(parsedId).session(session);
        if (!appDoc) {
          return null;
        }

        const endpointsDeleteResult = await EndpointModel.deleteMany({
          app_id: appDoc._id
        }).session(session);

        const deletedApp = await AppModel.findByIdAndDelete(appDoc._id).session(session);

        return {
          app: deletedApp?.toJSON() ?? null,
          connected_endpoints: endpointsDeleteResult.deletedCount ?? 0
        };
      });

      return result!;
    } finally {
      session.endSession();
    }
  }

};