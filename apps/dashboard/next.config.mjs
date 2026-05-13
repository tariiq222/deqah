import { withSentryConfig } from '@sentry/nextjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const shouldUploadSentryArtifacts = process.env.CI === "true" && Boolean(process.env.SENTRY_AUTH_TOKEN);

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.moyasar.com https://*.moyasar.com https://js.hcaptcha.com https://*.hcaptcha.com https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.hcaptcha.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.deqah.net https://api.deqah.net https://*.moyasar.com https://*.hcaptcha.com https://hcaptcha.com https://sentry.hcaptcha.com https://cloudflareinsights.com https://errors.webvue.pro",
      "frame-src https://*.moyasar.com https://*.hcaptcha.com https://hcaptcha.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === "production"

const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@deqah/ui", "@deqah/shared", "@deqah/api-client"],
  skipTrailingSlashRedirect: true,
  // Production builds: don't fail on existing lint/type warnings — those
  // are tracked separately by CI typecheck/lint jobs. Build must produce
  // a deployable artifact even with known stylistic issues.
  // (Mirrors apps/admin/next.config.mjs and apps/website/next.config.mjs.)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: [
    '@opentelemetry/instrumentation',
    '@opentelemetry/api-logs',
    '@sentry/node',
    '@prisma/instrumentation',
    'require-in-the-middle',
    'import-in-the-middle',
  ],
  // Strip dev-only credentials from production builds regardless of what is set in .env
  env: {
    NEXT_PUBLIC_DEV_EMAIL: isProduction ? "" : (process.env.NEXT_PUBLIC_DEV_EMAIL ?? ""),
    NEXT_PUBLIC_DEV_PASSWORD: isProduction ? "" : (process.env.NEXT_PUBLIC_DEV_PASSWORD ?? ""),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/_next/image",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ]
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5100/api/v1"
    // Strip /api/proxy prefix then forward to backend
    const backendBase = apiUrl.replace(/\/api\/v\d+$/, "")
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${backendBase}/api/v1/:path*`,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: 'webvue',
  project: 'deqah-dashboard',
  url: 'https://errors.webvue.pro/',
  silent: true,
  disableLogger: true,
  useRunAfterProductionCompileHook: shouldUploadSentryArtifacts,
  webpack: { disableSentryConfig: !shouldUploadSentryArtifacts },
  sourcemaps: { disable: !shouldUploadSentryArtifacts },
  release: {
    create: shouldUploadSentryArtifacts,
    finalize: shouldUploadSentryArtifacts,
    setCommits: shouldUploadSentryArtifacts ? { auto: true, ignoreMissing: true } : false,
  },
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
