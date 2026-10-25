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
  const origin = request.headers.get("origin");
  if (!origin) return false;
  // Compared with the host the browser connected to, not request.url: in the Docker image
  // Next.js listens on 0.0.0.0 and builds request.url from that address
  const host =
    (process.env.TRUST_PROXY_HEADERS === "true" && request.headers.get("x-forwarded-host")) ||
    request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Forwards a JSON POST from one of our pages to a backend auth endpoint and passes the answer
 * back unchanged. `token` is sent as the bearer token when the endpoint needs a login.
 */
export async function forwardAuthPost(request: Request, path: string, token?: string): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ detail: "Invalid request origin" }, { status: 403 });
  }
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...forwardedFor(request),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(await request.json()),
      cache: "no-store",
    });
    return new Response(response.status === 204 ? null : await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { detail: "Cannot connect to the backend. Check that it is running." },
      { status: 502 }
    );
  }
}
