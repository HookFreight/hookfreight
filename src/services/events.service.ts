import type { Request } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { EventModel } from "../models/Event";
import { EndpointModel } from "../models/Endpoint";
import { eventToHttpResponse, httpError } from "../utils/http";

const MAX_LIST_LIMIT = 50;

const ALLOWED_METHODS = new Set(["POST", "PUT", "PATCH", "GET"]);

function firstHeaderValue(v: string | string[] | undefined): string | undefined {
    if (!v) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

function buildDestinationUrl(req: Request): string {
    const xfProtoRaw = firstHeaderValue(req.headers["x-forwarded-proto"] as any);
    const xfHostRaw = firstHeaderValue(req.headers["x-forwarded-host"] as any);

    const proto = (xfProtoRaw?.split(",")[0]?.trim() || req.protocol || "http");
    const host = (xfHostRaw?.split(",")[0]?.trim() || req.get("host") || "");
    const pathAndQuery = req.originalUrl ?? req.url ?? "";

    return host ? `${proto}://${host}${pathAndQuery}` : pathAndQuery;
}

const objectIdSchema = z.string().trim().refine((v) => mongoose.isValidObjectId(v), { message: "Invalid ID", });

const listSchema = z.object({
    limit: z.coerce
        .number()
        .int()
        .default(10)
        .transform((n) => Math.max(1, Math.min(MAX_LIST_LIMIT, n))),
    offset: z.coerce.number().int().default(0).transform((n) => Math.max(0, n))
});

export const eventsService = {
    createEvent: async (req: Request) => {
        const method = req.method.toUpperCase();
        if (!ALLOWED_METHODS.has(method)) {
            throw httpError(405, "method_not_allowed");
        }

        const endpoint = await EndpointModel.findOne({ hook_token: req.params.hook_token });
        if (!endpoint) {
            throw httpError(404, "endpoint_not_found");
        }

        // TODO: MATCH HEADERS AND BODY AGAINST ENDPOINT CONFIGURATION. IF MATCH, RETURN 200.IF NOT, RETURN 400.

        const bodyBuffer =
            Buffer.isBuffer(req.rawBody) ? req.rawBody :
                Buffer.isBuffer(req.body) ? req.body :
                    Buffer.from(
                        typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? null),
                        "utf8"
                    );
        const sizeBytes = bodyBuffer.byteLength;
        const sourceUrl = req.get("origin") ?? req.get("referer") ?? req.get("referrer") ?? "";
        const destinationUrl = buildDestinationUrl(req);

        const event = await EventModel.create({
            endpoint_id: endpoint._id,
            recieved_at: new Date(),
            original_url: destinationUrl,
            source_url: sourceUrl,
            method,
            path: req.path,
            query: req.query,
            headers: req.headers,
            body: bodyBuffer,
            source_ip: req.ip,
            user_agent: req.get("user-agent"),
            size_bytes: sizeBytes
        });
        return event;
    },

    listEventsByEndpointId: async (endpointId: string, limit?: unknown, offset?: unknown) => {
        const parsedEndpointId = objectIdSchema.parse(endpointId);
        const parsed = listSchema.parse({ limit, offset });

        const docs = await EventModel.find({ endpoint_id: parsedEndpointId })
            .sort({ recieved_at: -1, _id: -1 })
            .skip(parsed.offset)
            .limit(parsed.limit + 1);

        const has_next = docs.length > parsed.limit;
        const events = docs.slice(0, parsed.limit).map((doc) => eventToHttpResponse(doc.toObject()));

        return { events, has_next, limit: parsed.limit, offset: parsed.offset };
    },

    getEvent: async (id: string) => {
        const doc = await EventModel.findById(id).exec();
        if (!doc){
            throw httpError(404, "event_not_found")
        };

        return eventToHttpResponse(doc.toObject());
    },
}