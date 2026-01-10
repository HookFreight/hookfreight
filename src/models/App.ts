import mongoose, { Schema } from "mongoose";

export type App = {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
};

const appSchema = new Schema<App>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc: unknown, ret: any) {
        ret.id = ret._id?.toString?.() ?? ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

export const AppModel = mongoose.models.App ?? mongoose.model<App>("App", appSchema);

