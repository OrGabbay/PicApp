import { NextResponse } from "next/server";
import { BACKEND_URL, forwardedFor, isSameOrigin } from "@/src/lib/backend";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { detail: "Invalid request origin" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardedFor(request) },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          detail:
            typeof data.detail === "string"
              ? data.detail
              : "Please check your email and password.",
        },
        { status: response.status }
      );
    }

    if (typeof data.access_token !== "string") {
      throw new Error("Backend did not return a token");
    }

    const result = NextResponse.json(
      { user: data.user },
      { headers: { "Cache-Control": "no-store" } }
    );

    result.cookies.set("access_token", data.access_token, {
      httpOnly: true,
      // Secure whenever the page was loaded over HTTPS (directly or via a proxy); plain HTTP
      // is only expected on localhost
      secure:
        new URL(request.url).protocol === "https:" ||
        request.headers.get("x-forwarded-proto") === "https",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 60,
    });

    return result;
  } catch {
    return NextResponse.json(
      { detail: "Login failed. Check that the backend is running." },
      { status: 502 }
    );
  }
}