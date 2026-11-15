import { ApiError } from "@/lib/api";

/** The FastAPI `detail` string of a failed request, or a friendly fallback. */
export function errorDetail(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

/** True when the server rejected the login pass (expired, signed out elsewhere, eliminated). */
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}
