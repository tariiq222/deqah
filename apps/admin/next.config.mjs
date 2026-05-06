import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' http://localhost:5100 https://*.deqah.app",
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
  url: 'http://100.124.231.44:8000/',
  silent: true,
  disableLogger: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
