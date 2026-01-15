import type { Request, Response } from "express";
import { eventsService } from "../services/events.service";

export const eventsController = {
    createEvent: async (req: Request, res: Response) => {
        await eventsService.createEvent(req);
        res.status(200).json({ message: "event_created", data: null });
    },

    getEvent: async (req: Request, res: Response) => {
        const event = await eventsService.getEvent(req.params.id);
        res.status(200).json({ message: "event_retrieved", data: event });
    },
}