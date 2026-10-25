import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { BACKEND_URL, forwardedFor, isSameOrigin } from "@/src/lib/backend";

/**
 * Proxies browser requests to the FastAPI backend and attaches the user's JWT from the
 * httpOnly `access_token` cookie, so client code never has to read the token itself.
 */

// Only these backend paths may be reached through the proxy
const ALLOWED_PREFIXES = ["api/v1/", "auth/me"];

// Request headers passed through to the backend (enhancer key + provider, image engine key)
const FORWARDED_HEADERS = ["content-type", "x-api-key", "x-anthropic-key", "x-provider", "x-image-key"];

/**
 * Next.js hands us decoded segments, so an encoded "..%2f" arrives as "../" inside one
 * segment. Reject anything that could change the path once re-joined.
 */
function isSafeSegment(segment: string): boolean {
  return segment !== "" && segment !== "." && segment !== ".." && !/[\/\\]/.test(segment);
}

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const segments = (await params).path;
  const path = segments.join("/");
  if (!segments.every(isSafeSegment) || !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  // Same CSRF protection as /api/auth/login for anything that changes data
  if (request.method !== "GET" && !isSameOrigin(request)) {
    return NextResponse.json({ detail: "Invalid request origin" }, { status: 403 });
  }

  const headers = new Headers(forwardedFor(request));
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const token = (await cookies()).get("access_token")?.value;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const target = `${BACKEND_URL}/${segments.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "DELETE" ? undefined : await request.text(),
      cache: "no-store",
    });

    const result = new NextResponse(response.status === 204 ? null : await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        ...(response.headers.get("retry-after") ? { "Retry-After": response.headers.get("retry-after")! } : {}),
      },
    });
    // Session is no longer valid: clear the cookie so the UI shows the user as logged out
    if (response.status === 401 && token) {
      result.cookies.delete("access_token");
    }
    return result;
  } catch {
    return NextResponse.json(
      { detail: "Cannot connect to the backend. Check that it is running." },
      { status: 502 }
    );
  }
}

export { proxy as GET, proxy as POST, proxy as DELETE };
