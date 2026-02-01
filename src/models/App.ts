/**
 * @fileoverview App model definition.
 *
 * Apps are the top-level organizational unit in HookFreight.
 * They group related endpoints together (e.g., by project or environment).
 *
 * @license Apache-2.0
 */

import mongoose, { Schema } from "mongoose";
import { makeAppId } from "../utils/public-id";

/**
 * App document type.
 *
 * @property name - Display name for the app (max 200 chars)
 * @property description - Optional description (max 5000 chars)
 * @property createdAt - Timestamp when the app was created
 * @property updatedAt - Timestamp when the app was last modified
 */
export type App = {
  public_id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose schema for the App collection.
 *
 * Features:
 * - Automatic timestamps (createdAt, updatedAt)
 * - JSON transform to convert _id to id and remove internal fields
 */
const appSchema = new Schema<App>(
  {
    public_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
      default: makeAppId,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: "" },
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
 * Mongoose model for App documents.
 *
 * Uses conditional model registration to support hot reloading in development.
 */
export const AppModel = mongoose.models.App ?? mongoose.model<App>("App", appSchema);
