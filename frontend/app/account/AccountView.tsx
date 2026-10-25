"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n, type MessageKey } from "@/src/i18n";
import { logout } from "./actions";

/** Translated text for the account page (the server component handles the cookie and token). */
export function AccountMessage({ message }: { message: MessageKey }) {
  const { t } = useI18n();
  return <main className="p-6">{t(message)}</main>;
}

export function AccountCard({ email, id }: { email: string; id: number }) {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.accountTitle")}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p>{t("auth.loggedInAs", { email })}</p>
          <p>{t("auth.userId", { id })}</p>

          <form action={logout}>
            <Button type="submit">{t("nav.logout")}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
