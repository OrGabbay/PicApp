import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { forwardAuthPost, isSameOrigin } from "@/src/lib/backend";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ detail: "Invalid request origin" }, { status: 403 });
  }
  const token = (await cookies()).get("access_token")?.value;
  if (!token) {
    return NextResponse.json({ detail: "Invalid or expired token" }, { status: 401 });
  }

  const response = await forwardAuthPost(request, "/auth/delete-account", token);
  if (response.status !== 204) return response;

  // The account is gone: end the session in this browser too
  const result = new NextResponse(null, { status: 204 });
  result.cookies.delete("access_token");
  return result;
}
