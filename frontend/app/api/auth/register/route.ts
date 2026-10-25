import { BACKEND_URL, forwardedFor, isSameOrigin } from "@/src/lib/backend";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ detail: "Invalid request origin" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardedFor(request) },
      body: JSON.stringify(body),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "Cannot connect to the backend. Check that it is running." },
      { status: 502 }
    );
  }
}
