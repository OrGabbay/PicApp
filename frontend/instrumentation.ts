/**
 * Runs once when the Next.js server starts.
 *
 * Without TRUST_PROXY_HEADERS the backend sees every visitor as this server's own address, so
 * its per-IP rate limits apply to all visitors together and the login lockout can't tell an
 * attacker from the real user (see forwardedFor in src/lib/backend.ts). Harmless on your own
 * machine, a problem once deployed: warn so it isn't forgotten.
 */
export function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.TRUST_PROXY_HEADERS !== "true"
  ) {
    console.warn(
      "[PicApp] TRUST_PROXY_HEADERS is not set: the backend can't see visitors' IP addresses, so " +
        "rate limits are shared by all visitors. Run behind a reverse proxy that overwrites " +
        "X-Forwarded-For (nginx, Vercel, ...) and set TRUST_PROXY_HEADERS=true."
    );
  }
}
