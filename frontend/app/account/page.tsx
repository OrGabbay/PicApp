import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountCard, AccountMessage } from "./AccountView";
import { BACKEND_URL } from "@/src/lib/backend";

// With Cache Components, reading cookies() must happen behind a Suspense boundary
export default function AccountPage() {
  return (
    <Suspense fallback={<AccountMessage message="auth.loadingAccount" />}>
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

  const response = await fetch(`${BACKEND_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return <AccountMessage message="common.backendOffline" />;
  }

  if (response.status === 401) {
    redirect("/login");
  }

  if (!response.ok) {
    return <AccountMessage message="auth.accountError" />;
  }

  const user = await response.json();

  return <AccountCard email={user.email} id={user.id} />;
}