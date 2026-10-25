"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BACKEND_URL } from "@/src/lib/backend";

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (token) {
    // Revoke the token on the backend so a copied token stops working immediately
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => null);
  }
  cookieStore.delete("access_token");
  redirect("/login");
}