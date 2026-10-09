import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/permissions";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

/** Parse with zod, throwing a ServiceError with per-field messages on failure. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    throw new ServiceError("Please check the highlighted fields.", fieldErrors);
  }
  return parsed.data;
}

interface PgLikeError {
  code?: string;
  message?: string;
}

/**
 * Converts database errors into user-safe messages. Messages raised deliberately by our SQL functions
 * are written for end users; anything else (constraint names, internals) is replaced with a generic message.
 */
export function dbError(error: PgLikeError | null | undefined, fallback = "Something went wrong. Please try again."): ServiceError {
  const message = error?.message ?? "";
  const internal = /violates|relation|column|syntax|constraint|function|schema|permission denied for/i.test(message);
  switch (error?.code) {
    case "42501":
      return new ServiceError(internal || !message ? "You do not have permission to do that." : message);
    case "23505":
      return new ServiceError(internal || !message ? "That already exists." : message);
    case "23503":
      return new ServiceError(internal || !message ? "A related record could not be found." : message);
    case "22023":
    case "23514":
    case "P0001":
      return new ServiceError(internal || !message ? "Some of the values are not valid." : message);
    case "PGRST116":
      return new ServiceError("Not found.");
    default:
      return new ServiceError(fallback);
  }
}

/** Run a service operation and convert thrown errors into a Result for server actions / tools. */
export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    return failure(err);
  }
}

export function failure(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (err instanceof ServiceError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof AuthorizationError) return { ok: false, error: err.message };
  // Never surface unknown internals to the client.
  if (process.env.NODE_ENV !== "test") console.error("[rt] unexpected error", err instanceof Error ? err.message : err);
  return { ok: false, error: "Something went wrong. Please try again." };
}
