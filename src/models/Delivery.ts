import mongoose, { Schema } from "mongoose";

export type DeliveryStatus = "timeout" | "delivered" | "failed";

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
                ret.id = ret._id?.toString?.() ?? ret.id;
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    }
);

deliverySchema.index({ event_id: 1, parent_delivery_id: 1 }, { unique: true });
deliverySchema.index({ status: 1, createdAt: -1 });

export const DeliveryModel =
    mongoose.models.Delivery ?? mongoose.model<Delivery>("Delivery", deliverySchema);
