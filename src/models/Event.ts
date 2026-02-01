/**
 * @fileoverview Event model definition.
 *
 * Events represent captured webhook requests received by HookFreight.
 * Each event stores the complete HTTP request data including headers, body, and metadata.
 *
 * @license Apache-2.0
 */

import mongoose, { Schema } from "mongoose";
import { makeEventId } from "../utils/public-id";

/**
 * Event document type.
 *
 * @property endpoint_id - Reference to the Endpoint that received this webhook
 * @property recieved_at - Timestamp when the webhook was received
 * @property original_url - Full URL that received the request
 * @property source_url - Origin/Referer of the request (if available)
 * @property method - HTTP method (GET, POST, PUT, PATCH)
 * @property path - Request path portion of the URL
 * @property query - Parsed query string parameters
 * @property headers - All request headers
 * @property body - Raw request body as a Buffer
 * @property source_ip - Client IP address
 * @property user_agent - User-Agent header value
 * @property size_bytes - Size of the request body in bytes
 * @property createdAt - Timestamp when the document was created
 * @property updatedAt - Timestamp when the document was last modified
 */
export type Event = {
  public_id: string;
  endpoint_id: mongoose.Types.ObjectId;
  recieved_at: Date;
  original_url: string;
  source_url?: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string | string[]>;
  body: Buffer;
  source_ip?: string;
  user_agent?: string;
  size_bytes: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose schema for the Event collection.
 *
 * Features:
 * - Indexed by endpoint_id for filtering events
 * - Compound index on (endpoint_id, recieved_at, _id) for efficient pagination
 * - Stores raw body as Buffer to preserve exact payload
 * - Automatic timestamps
 */
const eventSchema = new Schema<Event>(
  {
    public_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
      default: makeEventId,
    },
    endpoint_id: { type: Schema.Types.ObjectId, ref: "Endpoint", required: true, index: true },
    recieved_at: { type: Date, required: true, default: Date.now },
    original_url: { type: String, required: true, trim: true, maxlength: 5_000 },
    source_url: { type: String, required: false, trim: true, maxlength: 5_000, default: "" },
    method: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    path: { type: String, required: true, trim: true, maxlength: 5_000 },
    query: { type: Schema.Types.Mixed, required: true, default: {} },
    headers: { type: Schema.Types.Mixed, required: true, default: {} },
    body: { type: Buffer, required: true },
    source_ip: { type: String, required: false },
    user_agent: { type: String, required: false },
    size_bytes: { type: Number, required: true }
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

// Compound index for efficient event listing with cursor-based pagination
eventSchema.index({ endpoint_id: 1, recieved_at: -1, _id: -1 });

/**
 * Mongoose model for Event documents.
 */
export const EventModel =
  (mongoose.models.Event as mongoose.Model<Event> | undefined) ??
  mongoose.model<Event>("Event", eventSchema);
