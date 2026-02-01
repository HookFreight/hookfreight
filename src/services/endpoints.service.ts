/**
 * @fileoverview Endpoints service - business logic for Endpoint management.
 *
 * Provides CRUD operations for Endpoints with validation using Zod schemas.
 * Generates unique hook_tokens for webhook URLs.
 *
 * @license Apache-2.0
 */

import { z } from "zod";
import { randomBytes } from "node:crypto";

import { EndpointModel } from "../models/Endpoint";
import { AppModel } from "../models/App";
import { httpError } from "../utils/http";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of items to return in a list query */
const MAX_LIST_LIMIT = 1000;

// ============================================================================
// Validation Schemas
// ============================================================================

/** Validates prefixed public IDs */
const prefixedIdSchema = (prefix: string, message: string) =>
  z.string().trim().refine((v) => v.startsWith(prefix) && v.length > prefix.length, { message });

/** Public ID schema for apps */
const appIdSchema = prefixedIdSchema("app_", "App ID not valid");

/** Public ID schema for endpoints */
const endpointIdSchema = prefixedIdSchema("end_", "Invalid ID");

/** Schema for creating a new endpoint */
const createEndpointSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional(),
  app_id: appIdSchema,
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

/** Schema for list pagination parameters */
const listSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .default(10)
    .transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
  offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

// ============================================================================
// Update Schema Helpers
// ============================================================================

/** Converts empty strings to undefined for optional field handling */
const emptyStringToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

/** Converts null to undefined for consistent handling */
const nullToUndefined = (v: unknown) => (v === null ? undefined : v);

/** Creates an optional non-empty string schema with length constraints */
const optionalNonEmptyString = (min: number, max: number) =>
  z.preprocess(emptyStringToUndefined, z.string().trim().min(min).max(max)).optional();

/** Creates an optional number schema */
const optionalNumber = (schema: z.ZodNumber) => z.preprocess(nullToUndefined, schema.optional());

/** Creates an optional boolean schema */
const optionalBoolean = () => z.preprocess(nullToUndefined, z.boolean().optional());

/**
 * Schema for updating authentication settings.
 * Requires both header_name and header_value if either is provided.
 */
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
      // If both are undefined or empty, treat as "not provided"
      .transform((a) =>
        a.header_name === undefined && a.header_value === undefined
          ? undefined
          : { header_name: a.header_name!, header_value: a.header_value! }
      )
  )
  .optional();

/** Schema for updating an endpoint (at least one field required) */
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

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Endpoints service providing CRUD operations.
 *
 * All methods validate input using Zod schemas and throw on invalid data.
 */
export const endpointsService = {
  /**
   * Creates a new endpoint for an app.
   *
   * Generates a unique hook_token (24 hex characters) for the webhook URL.
   * Validates that the parent app exists.
   *
   * @param body - Request body with endpoint configuration
   * @returns The created endpoint document
   * @throws HttpError(404) if the parent app doesn't exist
   * @throws ZodError if validation fails
   */
  createEndpoint: async (body: unknown) => {
    const parsedBody = createEndpointSchema.parse(body);

    // Verify the parent app exists
    const app = await AppModel.findOne({ public_id: parsedBody.app_id });
    if (!app) {
      throw httpError(404, "app_not_found");
    }

    // Generate a unique hook_token for the webhook URL
    const hookToken = randomBytes(12).toString("hex");
    const { app_id: _appPublicId, ...payload } = parsedBody;
    const endpoint = await EndpointModel.create({
      ...payload,
      app_id: app._id,
      hook_token: hookToken,
    });
    const json = endpoint.toJSON();
    json.app_id = app.public_id;
    return json;
  },

  /**
   * Lists endpoints belonging to a specific app.
   *
   * @param appId - Public ID of the parent app (app_...)
   * @param limit - Maximum number of endpoints to return (default: 10, max: 1000)
   * @param offset - Number of endpoints to skip (default: 0)
   * @returns Paginated list of endpoints with has_next indicator
   */
  listEndpointsByAppId: async (appId: string, limit?: unknown, offset?: unknown) => {
    const parsedAppId = appIdSchema.parse(appId);
    const parsed = listSchema.parse({ limit, offset });

    const app = await AppModel.findOne({ public_id: parsedAppId }, { _id: 1, public_id: 1 });
    if (!app) {
      return { endpoints: [], has_next: false, limit: parsed.limit, offset: parsed.offset };
    }

    // Fetch one extra to determine if there are more pages
    const docs = await EndpointModel.find({ app_id: app._id })
      .skip(parsed.offset)
      .limit(parsed.limit + 1);

    const has_next = docs.length > parsed.limit;
    const endpoints = docs.slice(0, parsed.limit).map((endpoint) => {
      const json = endpoint.toJSON();
      json.app_id = app.public_id;
      return json;
    });

    return { endpoints, has_next, limit: parsed.limit, offset: parsed.offset };
  },

  /**
   * Retrieves a single endpoint by ID.
   *
   * @param id - Public ID of the endpoint (end_...)
   * @returns The endpoint document
   * @throws HttpError(404) if endpoint doesn't exist
   * @throws ZodError if ID is invalid
   */
  getEndpoint: async (id: string) => {
    const parsedId = endpointIdSchema.parse(id);
    const endpoint = await EndpointModel.findOne({ public_id: parsedId })
      .populate("app_id", "public_id -_id")
      .exec();
    if (!endpoint) {
      throw httpError(404, "endpoint_not_found");
    }
    const json = endpoint.toJSON();
    const appPublicId = (endpoint.app_id as { public_id?: string } | null)?.public_id;
    if (appPublicId) json.app_id = appPublicId;
    return json;
  },

  /**
   * Updates an existing endpoint.
   *
   * Only updates fields that are explicitly provided.
   *
   * @param id - Public ID of the endpoint (end_...)
   * @param body - Fields to update
   * @returns The updated endpoint document
   * @throws HttpError(404) if endpoint doesn't exist
   * @throws ZodError if validation fails
   */
  updateEndpoint: async (id: string, body: unknown) => {
    const parsedId = endpointIdSchema.parse(id);
    const parsedBody = updateEndpointSchema.parse(body);

    // Filter out undefined values to only update provided fields
    const update = Object.fromEntries(
      Object.entries(parsedBody).filter(([, v]) => v !== undefined)
    );

    const updated = await EndpointModel.findOneAndUpdate({ public_id: parsedId }, update, {
      new: true,
      runValidators: true
    })
      .populate("app_id", "public_id -_id")
      .exec();

    if (!updated) {
      throw httpError(404, "endpoint_not_found");
    }
    const json = updated.toJSON();
    const appPublicId = (updated.app_id as { public_id?: string } | null)?.public_id;
    if (appPublicId) json.app_id = appPublicId;
    return json;
  },

  /**
   * Deletes an endpoint.
   *
   * Note: Associated events are NOT automatically deleted.
   * Consider implementing cascade delete if needed.
   *
   * @param id - Public ID of the endpoint (end_...)
   * @returns The deleted endpoint document
   * @throws HttpError(404) if endpoint doesn't exist
   * @throws ZodError if ID is invalid
   */
  deleteEndpoint: async (id: string) => {
    const parsedId = endpointIdSchema.parse(id);
    const deleted = await EndpointModel.findOneAndDelete({ public_id: parsedId })
      .populate("app_id", "public_id -_id")
      .exec();
    if (!deleted) {
      throw httpError(404, "endpoint_not_found");
    }
    const json = deleted.toJSON();
    const appPublicId = (deleted.app_id as { public_id?: string } | null)?.public_id;
    if (appPublicId) json.app_id = appPublicId;
    return json;
  }
};
