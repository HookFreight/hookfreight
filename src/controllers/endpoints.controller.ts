import type { Request, Response } from "express";
import { endpointsService } from "../services/endpoints.service";

export const endpointsController = {
  createEndpoint: async (req: Request, res: Response) => {
    const endpoint = await endpointsService.createEndpoint(req.body);
    res.status(201).json({ message: "endpoint_created", data: endpoint });
  },

  getEndpoint: async (req: Request, res: Response) => {
    const endpoint = await endpointsService.getEndpoint(req.params.id);
    res.status(200).json({ message: "endpoint_retrieved", data: endpoint });
  },

  updateEndpoint: async (req: Request, res: Response) => {
    const endpoint = await endpointsService.updateEndpoint(req.params.id, req.body);
    res.status(200).json({ message: "endpoint_updated", data: endpoint });
  },

  deleteEndpoint: async (req: Request, res: Response) => {
    const deleted = await endpointsService.deleteEndpoint(req.params.id);
    res.status(200).json({ message: "endpoint_deleted", data: deleted });
  }
};


