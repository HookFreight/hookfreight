import type { Request, Response } from "express";

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: "not_found" });
}
