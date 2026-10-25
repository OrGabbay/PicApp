"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n, translateServerMessage } from "@/src/i18n";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordMeetsRules } from "@/src/lib/password";

// useSearchParams needs a Suspense boundary so the rest of the page can be prerendered
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  // Kept in state: the token is removed from the address bar below
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");
  const [loading, setLoading] = useState(false);
  const { t, language } = useI18n();

  // Keep the token out of the browser history once it has been read
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", "/reset-password");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!passwordMeetsRules(password)) {
      setMessage(t("auth.passwordRules"));
      return;
    }
    if (password !== confirm) {
      setMessage(t("auth.passwordsDontMatch"));
      return;
    }
    setLoading(true);

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (response.ok) {
        setStatus("done");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (response.status === 400) {
        setStatus("invalid");
      } else {
        setMessage(typeof data.detail === "string" ? translateServerMessage(language, data.detail) : t("auth.genericError"));
      }
    } catch {
      setMessage(t("auth.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.resetTitle")}</CardTitle>
        </CardHeader>

        <CardContent>
          {status === "done" ? (
            <div className="space-y-4">
              <p role="status">{t("auth.resetDone")}</p>
              <p className="text-sm">
                <Link href="/login" className="underline">
                  {t("auth.login")}
                </Link>
              </p>
            </div>
          ) : status === "invalid" ? (
            <div className="space-y-4">
              <p role="status">{t("auth.resetInvalid")}</p>
              <p className="text-sm">
                <Link href="/forgot-password" className="underline">
                  {t("auth.requestNewLink")}
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.newPassword")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  aria-describedby="password-hint"
                  required
                />
                <p id="password-hint" className="text-xs text-muted-foreground">
                  {t("auth.passwordHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  maxLength={PASSWORD_MAX_LENGTH}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("auth.saving") : t("auth.savePassword")}
              </Button>

              {message && <p role="status">{message}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
