import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json(
      { detail: "Invalid request origin" },
      { status: 403 }
    );
  }

  const result = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  result.cookies.delete("access_token");
  return result;
}
