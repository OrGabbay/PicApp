import { forwardAuthPost } from "@/src/lib/backend";

export async function POST(request: Request) {
  return forwardAuthPost(request, "/auth/password-reset/confirm");
}
