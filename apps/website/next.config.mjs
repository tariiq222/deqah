import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  transpilePackages: ['@deqah/api-client', '@deqah/shared'],
  typedRoutes: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default withSentryConfig(nextConfig, {
  org: 'webvue',
  project: 'deqah-website',
  url: 'http://100.124.231.44:8000/',
  silent: true,
  disableLogger: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
