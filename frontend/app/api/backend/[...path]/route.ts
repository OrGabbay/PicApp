import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxies browser requests to the FastAPI backend and attaches the user's JWT from the
 * httpOnly `access_token` cookie, so client code never has to read the token itself.
 */
const BACKEND_URL = "http://127.0.0.1:8000";

// Only these backend paths may be reached through the proxy
const ALLOWED_PREFIXES = ["api/v1/", "auth/me"];

// Request headers passed through to the backend (AI key + provider selection)
const FORWARDED_HEADERS = ["content-type", "x-api-key", "x-anthropic-key", "x-provider"];

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  // Same CSRF protection as /api/auth/login for anything that changes data
  if (request.method !== "GET" && request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ detail: "Invalid request origin" }, { status: 403 });
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const token = (await cookies()).get("access_token")?.value;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const response = await fetch(`${BACKEND_URL}/${path}${request.nextUrl.search}`, {
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
