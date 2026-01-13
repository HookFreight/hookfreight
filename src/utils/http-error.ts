export type HttpError = Error & { status?: number; details?: unknown; code?: string };

export function httpError(status: number, message: string, details?: unknown): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  if (details !== undefined) err.details = details;
  return err;
}


