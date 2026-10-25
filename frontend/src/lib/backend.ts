/**
 * Server-side helpers for talking to the FastAPI backend from Next.js route handlers and
 * server components. Not for browser code (the browser goes through /api/backend).
 */

/** Where the backend runs. Set BACKEND_URL in .env.local when it isn't on this machine. */
export const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

/**
 * Passes the visitor's IP on to the backend so its rate limits apply per visitor.
 *
 * Next.js forwards a client-supplied X-Forwarded-For header unchanged, so the header can only
 * be trusted when a reverse proxy in front of Next.js (nginx, Vercel, …) overwrites it. Set
 * TRUST_PROXY_HEADERS=true in that setup; otherwise nothing is forwarded and the backend's
 * per-IP limits count all traffic from this server together.
 */
export function forwardedFor(request: Request): Record<string, string> {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return {};
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return ip ? { "X-Forwarded-For": ip } : {};
}

/** True when a state-changing request comes from our own pages (basic CSRF protection). */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}
