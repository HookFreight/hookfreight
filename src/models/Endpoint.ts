/**
 * @fileoverview Endpoint model definition.
 *
 * Endpoints represent unique webhook receiver URLs within an App.
 * Each endpoint has its own hook_token, forwarding configuration, and settings.
 *
 * @license Apache-2.0
 */

import mongoose, { Schema } from "mongoose";
import { makeEndpointId } from "../utils/public-id";

/**
 * Authentication configuration for forwarding webhooks.
 *
 * When set, HookFreight adds this header to forwarded requests.
 * Commonly used for Bearer tokens or API keys.
 *
 * @property header_name - HTTP header name (e.g., "Authorization")
 * @property header_value - Header value (e.g., "Bearer sk_live_...")
 */
export type EndpointAuthentication = {
  header_name: string;
  header_value: string;
};

/**
 * Endpoint document type.
 *
 * @property name - Display name for the endpoint
 * @property description - Optional description
 * @property app_id - Reference to the parent App
 * @property authentication - Optional auth header for forwarding
 * @property http_timeout - Timeout in ms for forwarded requests (default: 10000)
 * @property is_active - Whether the endpoint accepts webhooks
 * @property rate_limit - Max requests per rate_limit_duration (0 = unlimited)
 * @property rate_limit_duration - Rate limit window in ms (default: 60000)
 * @property forward_url - Destination URL for forwarding webhooks
 * @property forwarding_enabled - Whether to forward incoming webhooks
 * @property hook_token - Unique token used in the webhook URL (immutable)
 * @property createdAt - Timestamp when created
 * @property updatedAt - Timestamp when last modified
 */
export type Endpoint = {
  public_id: string;
  name: string;
  description?: string;
  app_id: mongoose.Types.ObjectId;
  authentication?: EndpointAuthentication;
  http_timeout?: number;
  is_active?: boolean;
  rate_limit?: number;
  rate_limit_duration?: number;
  forward_url: string;
  forwarding_enabled?: boolean;
  hook_token?: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Nested schema for authentication configuration.
 * Stored as an embedded document (no separate _id).
 */
const authSchema = new Schema<EndpointAuthentication>(
  {
    header_name: { type: String, required: true, trim: true, maxlength: 200 },
    header_value: { type: String, required: true, trim: true, maxlength: 2000 }
  },
  { _id: false }
);

/**
 * Mongoose schema for the Endpoint collection.
 *
 * Features:
 * - Indexed by app_id for efficient queries
 * - Unique hook_token for URL generation
 * - Automatic timestamps
 * - JSON transform for API responses
 */
const endpointSchema = new Schema<Endpoint>(
  {
    public_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
      default: makeEndpointId,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: "" },
    app_id: { type: Schema.Types.ObjectId, ref: "App", required: true, index: true },
    authentication: { type: authSchema, required: false },
    http_timeout: { type: Number, min: 1, default: 10_000 },
    is_active: { type: Boolean, default: false },
    rate_limit: { type: Number, min: 0, default: 0 },
    rate_limit_duration: { type: Number, min: 1_000, default: 60_000 },
    forward_url: { type: String, required: false, trim: true, default: "" },
    forwarding_enabled: { type: Boolean, default: false },
    // hook_token is immutable once set - used in public webhook URLs
    hook_token: { type: String, trim: true, default: "", immutable: true, unique: true }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc: unknown, ret: any) {
        // Use public_id for API responses
        ret.id = ret.public_id ?? ret.id;
        delete ret.public_id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

/**
 * Mongoose model for Endpoint documents.
 */
export const EndpointModel =
  mongoose.models.Endpoint ?? mongoose.model<Endpoint>("Endpoint", endpointSchema);
