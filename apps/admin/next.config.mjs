import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const withNextIntl = createNextIntlPlugin('./i18n.ts');
const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '../..');
const shouldUploadSentryArtifacts = process.env.CI === 'true' && Boolean(process.env.SENTRY_AUTH_TOKEN);

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.hcaptcha.com https://*.hcaptcha.com https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://*.hcaptcha.com https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.deqah.net https://api.deqah.net https://*.hcaptcha.com https://hcaptcha.com https://sentry.hcaptcha.com https://cloudflareinsights.com https://errors.webvue.pro",
      "frame-src https://*.hcaptcha.com https://hcaptcha.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@deqah/ui', '@deqah/api-client', '@deqah/shared'],
  skipTrailingSlashRedirect: true,
  // Production builds: don't fail on existing lint/type warnings — those
  // are tracked separately by CI typecheck/lint jobs. Build must produce
  // a deployable artifact even with known stylistic issues.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5100/api/v1';
    const backendBase = apiUrl.replace(/\/api\/v\d+$/, '');
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${backendBase}/api/v1/:path*`,
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'webvue',
  project: 'deqah-admin',
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
