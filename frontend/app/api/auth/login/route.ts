import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json(
      { detail: "Invalid request origin" },
      { status: 403 }
    );
  }

  const body = await request.json();

  try {
    const response = await fetch("http://127.0.0.1:8000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      secure: process.env.NODE_ENV === "production",
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