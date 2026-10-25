/**
 * Runs once when the Next.js server starts.
 *
 * Without TRUST_PROXY_HEADERS the backend sees every visitor as this server's own address, so
 * its per-IP rate limits apply to all visitors together and the login lockout can't tell an
 * attacker from the real user (see forwardedFor in src/lib/backend.ts). Harmless when the app
 * runs on the user's own computer, a problem once it's on a server: warn so it isn't forgotten.
 */
export function register() {
  const publicBackendUrl = process.env.PUBLIC_BACKEND_URL ?? "http://localhost:8000";
  const runsLocally = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(publicBackendUrl);
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.TRUST_PROXY_HEADERS !== "true" &&
    !runsLocally
  ) {
    console.warn(
      "[PicApp] TRUST_PROXY_HEADERS is not set: the backend can't see visitors' IP addresses, so " +
        "rate limits are shared by all visitors. Run behind a reverse proxy that overwrites " +
        "X-Forwarded-For (nginx, Vercel, ...) and set TRUST_PROXY_HEADERS=true."
    );
  }
}
