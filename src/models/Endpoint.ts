import mongoose, { Schema } from "mongoose";

export type EndpointAuthentication = {
  header_name: string;
  header_value: string;
};

export type Endpoint = {
  name: string;
  description?: string;
  app_id: mongoose.Types.ObjectId;
  authentication?: EndpointAuthentication;
  http_timeout?: number;
  is_active?: boolean;
  rate_limit?: number;
  rate_limit_duration?: number; 
  url: string;
  hook_token?: string;
  createdAt: Date;
  updatedAt: Date;
};

const authSchema = new Schema<EndpointAuthentication>(
  {
    header_name: { type: String, required: true, trim: true, maxlength: 200 },
    header_value: { type: String, required: true, trim: true, maxlength: 2000 }
  },
  { _id: false }
);

const endpointSchema = new Schema<Endpoint>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: "" },
    app_id: { type: Schema.Types.ObjectId, ref: "App", required: true, index: true },
    authentication: { type: authSchema, required: false },
    http_timeout: { type: Number, min: 1, default: 10_000 },
    is_active: { type: Boolean, default: false },
    rate_limit: { type: Number, min: 0, default: 0 },
    rate_limit_duration: { type: Number, min: 1_000, default: 60_000 },
    url: { type: String, required: true, trim: true },
    hook_token: { type: String, trim: true, default: "", immutable: true, unique: true }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc: unknown, ret: any) {
        ret.id = ret._id?.toString?.() ?? ret.id;
        ret.app_id = ret.app_id?.toString?.() ?? ret.app_id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

export const EndpointModel =
  mongoose.models.Endpoint ?? mongoose.model<Endpoint>("Endpoint", endpointSchema);


