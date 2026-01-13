import mongoose, { Schema } from "mongoose";

export type Event = {
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

const eventSchema = new Schema<Event>(
    {
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
                ret.id = ret._id?.toString?.() ?? ret.id;
                delete ret._id;
                delete ret.__v;
                return ret;
            }
        }
    });

eventSchema.index({ endpoint_id: 1, recieved_at: -1, _id: -1 });

export const EventModel =
  (mongoose.models.Event as mongoose.Model<Event> | undefined) ??
  mongoose.model<Event>("Event", eventSchema);