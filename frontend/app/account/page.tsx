import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { logout } from "./actions";

// With Cache Components, reading cookies() must happen behind a Suspense boundary
export default function AccountPage() {
  return (
    <Suspense fallback={<main className="p-6">Loading your account…</main>}>
      <AccountDetails />
    </Suspense>
  );
}

async function AccountDetails() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (!token) {
    redirect("/login");
  }

  const response = await fetch("http://127.0.0.1:8000/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return <main className="p-6">Cannot connect to the backend.</main>;
  }

  if (response.status === 401) {
    redirect("/login");
  }

  if (!response.ok) {
    return <main className="p-6">Could not load your account.</main>;
  }

  const user = await response.json();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Your PicApp account</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p>Logged in as: {user.email}</p>
          <p>User ID: {user.id}</p>

          <form action={logout}>
            <Button type="submit">Log out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}