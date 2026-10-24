import type { ApiErrorBody } from "@/types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the backend could not be reached at all. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function toApiError(status: number, body: unknown, fallback: string): ApiError {
  const err = (body as ApiErrorBody | null)?.error;
  if (err && typeof err.message === "string") {
    return new ApiError(status, err.code ?? "ERROR", err.message, err.details ?? {});
  }
  return new ApiError(status, "HTTP_ERROR", fallback);
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
