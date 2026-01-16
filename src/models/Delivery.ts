/**
 * @fileoverview Delivery model definition.
 *
 * Deliveries track the forwarding attempts for each Event.
 * Each delivery records the outcome (success/failure/timeout) along with
 * response details and timing information.
 *
 * @license Apache-2.0
 */

import mongoose, { Schema } from "mongoose";

/**
 * Possible delivery outcomes.
 *
 * - "delivered": Successfully forwarded (2xx response)
 * - "failed": Forwarding failed (non-2xx response or error)
 * - "timeout": Request timed out before receiving response
 */
export type DeliveryStatus = "timeout" | "delivered" | "failed";

/**
 * Delivery document type.
 *
 * @property parent_delivery_id - Reference to the previous delivery attempt (for retries)
 * @property status - Outcome of the delivery attempt
 * @property event_id - Reference to the Event being delivered
 * @property destination_url - URL the webhook was forwarded to
 * @property response_status - HTTP status code from destination
 * @property response_headers - Response headers from destination
 * @property response_body - Response body from destination (as Buffer)
 * @property duration - Time taken for the request in milliseconds
 * @property error_message - Error description if delivery failed
 * @property createdAt - Timestamp when the delivery was attempted
 * @property updatedAt - Timestamp when last modified
 */
export type Delivery = {
  parent_delivery_id?: mongoose.Types.ObjectId;
  status: DeliveryStatus;
  event_id: mongoose.Types.ObjectId;
  destination_url: string;
  response_status?: number;
  response_headers?: Record<string, string | string[]>;
  response_body?: Buffer;
  duration?: number;
  error_message?: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose schema for the Delivery collection.
 *
 * Features:
 * - Indexed by event_id and status for efficient queries
 * - Unique constraint on (event_id, parent_delivery_id) to prevent duplicates
 * - Compound index on (status, createdAt) for queue monitoring
 * - Automatic timestamps
 */
const deliverySchema = new Schema<Delivery>(
  {
    parent_delivery_id: { type: Schema.Types.ObjectId, ref: "Delivery", required: false, index: true },
    status: { type: String, required: true, enum: ["timeout", "delivered", "failed"], index: true },
    event_id: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    destination_url: { type: String, required: true, trim: true, maxlength: 5000 },
    response_status: { type: Number, required: false, index: true },
    response_headers: { type: Schema.Types.Mixed, required: false, default: undefined },
    response_body: { type: Buffer, required: false, default: undefined },
    duration: { type: Number, required: false, min: 0, index: true },
    error_message: { type: String, required: false, trim: true, maxlength: 5000 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc: unknown, ret: any) {
        // Convert MongoDB _id to id for API responses
        ret.id = ret._id?.toString?.() ?? ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Unique constraint prevents duplicate delivery records per event
deliverySchema.index({ event_id: 1, parent_delivery_id: 1 }, { unique: true });

// Index for monitoring delivery status over time
deliverySchema.index({ status: 1, createdAt: -1 });

/**
 * Mongoose model for Delivery documents.
 */
export const DeliveryModel =
  mongoose.models.Delivery ?? mongoose.model<Delivery>("Delivery", deliverySchema);
