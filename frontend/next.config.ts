import type { NextConfig } from "next";

// Where the FastAPI backend lives, as seen by the Next.js server (not the browser)
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "media-src 'self' blob:",
      // The API is same-origin in production (rewrite below); NEXT_PUBLIC_API_BASE_URL may name another
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_BASE_URL?.startsWith("http") ? new URL(process.env.NEXT_PUBLIC_API_BASE_URL).origin : ""}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Lets the end-to-end tests build into their own folder without touching a running dev server
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // A small server bundle for the Docker image
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Same-origin API: the browser calls /api/v1/... on the site's own domain and Next forwards it to
  // the backend, so the session cookie is first-party and needs no cross-site CORS settings.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` }];
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
