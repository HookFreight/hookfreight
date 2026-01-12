import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

function formatZodError(err: ZodError) {
  return {
    message: "validation_error",
    errors: err.issues.map((i) => ({
      field: i.path.length ? i.path.join(".") : undefined,
      code: i.code,
      message: i.message,
      expected: "expected" in i ? i.expected : undefined,
      received: "received" in i ? i.received : undefined,
    })),
  };
}

type HttpError = Error & { status?: number; details?: unknown; code?: string };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (typeof err === "object" && err && "type" in err && (err as any).type === "entity.too.large") {
    res.status(413).json({ message: "payload_too_large", data: null });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  const httpErr = err as HttpError;
  const status = httpErr?.status ?? 500;
  const message =
    status === 500
      ? "an error occured, please try again later."
      : (httpErr?.message ?? "internal_error");

  console.error(err);

  res.status(status).json({
    message,
    data: httpErr?.details ?? null
  });
}


