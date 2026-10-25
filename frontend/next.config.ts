import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Public address of the backend: saved images (DALL-E / Imagen) are loaded from it directly
const publicBackendUrl = (process.env.PUBLIC_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");
const imageSources = `https://image.pollinations.ai ${publicBackendUrl}`;

// Content Security Policy without nonces (nonces would force every page to render
// dynamically and don't work with partial prerendering). It still blocks scripts from
// other sites, plugins, framing by other sites and form posts to other origins.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${imageSources}`,
  // The "Download" button fetches the image file itself
  `connect-src 'self' ${imageSources}${isDev ? " ws: wss:" : ""}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Only meaningful over HTTPS, so only in production builds
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.pollinations.ai",
      },
    ],
  },
  experimental: {
    // Off: this experiment asks coding agents to send feedback reports to the Next.js team
    agentFeedback: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
