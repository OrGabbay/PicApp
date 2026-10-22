export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch(
      "http://127.0.0.1:8000/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

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