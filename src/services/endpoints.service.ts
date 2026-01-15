import mongoose from "mongoose";
import { z } from "zod";
import { randomBytes } from "node:crypto";

import { EndpointModel } from "../models/Endpoint";
import { AppModel } from "../models/App";
import { httpError } from "../utils/http";

const MAX_LIST_LIMIT = 1000;

const createEndpointSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional(),
  app_id: z.string().trim().refine((v) => mongoose.isValidObjectId(v), { message: "App ID not valid", }),
  authentication: z.object({
    header_name: z.string().trim().min(1).max(200),
    header_value: z.string().trim().min(1).max(2000)
  }).optional(),
  http_timeout: z.number().int().positive().max(120_000).optional(),
  is_active: z.boolean().optional(),
  rate_limit: z.number().int().min(0).optional(),
  rate_limit_duration: z.number().int().min(1).max(86_400).optional(),
  forward_url: z.string().trim().min(1).max(5_000).optional(),
  forwarding_enabled: z.boolean().optional().default(false),
});

const objectIdSchema = z.string().trim().refine((v) => mongoose.isValidObjectId(v), { message: "Invalid ID", });

const listSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .default(10)
    .transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
  offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

const emptyStringToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
const nullToUndefined = (v: unknown) => (v === null ? undefined : v);

const optionalNonEmptyString = (min: number, max: number) =>
  z.preprocess(emptyStringToUndefined, z.string().trim().min(min).max(max)).optional();

const optionalNumber = (schema: z.ZodNumber) => z.preprocess(nullToUndefined, schema.optional());
const optionalBoolean = () => z.preprocess(nullToUndefined, z.boolean().optional());

const updateAuthenticationSchema = z
  .preprocess(
    (v) => (v == null ? undefined : v),
    z
      .object({
        header_name: optionalNonEmptyString(1, 200),
        header_value: optionalNonEmptyString(1, 2000)
      })
      .refine(
        (a) =>
          (a.header_name === undefined && a.header_value === undefined) ||
          (a.header_name !== undefined && a.header_value !== undefined),
        { message: "Provide both authentication.header_name and authentication.header_value" }
      )
      // If user passes {}, or both empty strings, treat as "not provided"
      .transform((a) =>
        a.header_name === undefined && a.header_value === undefined
          ? undefined
          : { header_name: a.header_name!, header_value: a.header_value! }
      )
  )
  .optional();

const updateEndpointSchema = z.preprocess(
  (v) => (v == null ? {} : v),
  z
    .object({
      name: optionalNonEmptyString(1, 200),
      description: z.preprocess(emptyStringToUndefined, z.string().trim().max(5_000)).optional(),
      authentication: updateAuthenticationSchema,
      http_timeout: optionalNumber(z.number().int().positive().max(120_000)),
      is_active: optionalBoolean(),
      rate_limit: optionalNumber(z.number().int().min(0)),
      rate_limit_duration: optionalNumber(z.number().int().min(1).max(86_400)),
      forward_url: optionalNonEmptyString(1, 5_000),
      forwarding_enabled: optionalBoolean(),
    }) 
    .refine(
      (val) =>
        val.name !== undefined ||
        val.description !== undefined ||
        val.authentication !== undefined ||
        val.http_timeout !== undefined ||
        val.is_active !== undefined ||
        val.rate_limit !== undefined ||
        val.rate_limit_duration !== undefined ||
        val.forward_url !== undefined ||
        val.forwarding_enabled !== undefined,
      { message: "Provide at least one field to update" }
    )
);

export const endpointsService = {
  createEndpoint: async (body: unknown) => {
    const parsedBody = createEndpointSchema.parse(body);

    const app = await AppModel.findById(parsedBody.app_id);
    if (!app) {
      throw httpError(404, "app_not_found",);
    }

    const hookToken = randomBytes(12).toString("hex");
    const endpoint = await EndpointModel.create({ ...parsedBody, hook_token: hookToken });
    return endpoint.toJSON();
  },

  listEndpointsByAppId: async (appId: string, limit?: unknown, offset?: unknown) => {
    const parsedAppId = objectIdSchema.parse(appId);
    const parsed = listSchema.parse({ limit, offset });

    const docs = await EndpointModel.find({ app_id: parsedAppId })
      .skip(parsed.offset)
      .limit(parsed.limit + 1);

    const has_next = docs.length > parsed.limit;
    const endpoints = docs.slice(0, parsed.limit).map((endpoint) => endpoint.toJSON());

    return { endpoints, has_next, limit: parsed.limit, offset: parsed.offset };
  },

  getEndpoint: async (id: string) => {
    const parsedId = objectIdSchema.parse(id);
    const endpoint = await EndpointModel.findById(parsedId);
    if (!endpoint) {
      throw httpError(404, "endpoint_not_found");
    }
    return endpoint.toJSON();
  },

  updateEndpoint: async (id: string, body: unknown) => {
    const parsedId = objectIdSchema.parse(id);
    const parsedBody = updateEndpointSchema.parse(body);

    const update = Object.fromEntries(
      Object.entries(parsedBody).filter(([, v]) => v !== undefined)
    );

    const updated = await EndpointModel.findByIdAndUpdate(parsedId, update, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      throw httpError(404, "endpoint_not_found");
    }
    return updated.toJSON();
  },


  deleteEndpoint: async (id: string) => {
    const parsedId = objectIdSchema.parse(id);
    const deleted = await EndpointModel.findByIdAndDelete(parsedId);
    if (!deleted) {
      throw httpError(404, "endpoint_not_found");
    }
    return deleted.toJSON();
  }
}