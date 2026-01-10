import type { Request, Response } from "express";
import { appsService } from "../services/apps.service";
import { endpointsService } from "../services/endpoints.service";

export const appsController = {

  listApps: async (req: Request, res: Response) => {
    const apps = await appsService.listApps(req.query.limit, req.query.offset);
    res.status(200).json({ message: "apps_listed", data: apps });
  },

  createApp: async (req: Request, res: Response) => {
    const app = await appsService.createApp(req.body);
    res.status(201).json({ message: "app_created", data: app });
  },

  getApp: async (req: Request, res: Response) => {
    const app = await appsService.getApp(req.params.id);
    if (!app) {
      res.status(404).json({ message: "app_not_found", data: null });
      return;
    }
    res.status(200).json({ message: "app_retrieved", data: app });
  },

  updateApp: async (req: Request, res: Response) => {
    const app = await appsService.updateApp(req.params.id, req.body);
    if (!app) {
      res.status(404).json({ message: "app_not_found", data: null });
      return;
    }
    res.status(200).json({ message: "app_updated", data: app });
  },

  deleteApp: async (req: Request, res: Response) => {
    const deleted = await appsService.deleteApp(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: "app_not_found", data: null });
      return;
    }
    res.status(200).json({ message: "app_deleted", data: deleted });
  },

  listEndpointsByAppId: async (req: Request, res: Response) => {
    const endpoints = await endpointsService.listEndpointsByAppId(req.params.id, req.query.limit, req.query.offset);
    res.status(200).json({ message: "endpoints_listed", data: endpoints });
  },
};


