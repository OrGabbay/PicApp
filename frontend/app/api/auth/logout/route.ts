import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BACKEND_URL, isSameOrigin } from "@/src/lib/backend";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { detail: "Invalid request origin" },
      { status: 403 }
    );
  }

  // Revoke the token on the backend too, so a copied token stops working immediately
  const token = (await cookies()).get("access_token")?.value;
  if (token) {
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => null);
  }

  const result = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  result.cookies.delete("access_token");
  return result;
}
