import { INestApplication } from '@nestjs/common';
import { isReservedSubdomain, DEFAULT_RESERVED_SUBDOMAINS } from './common/tenant/subdomain.utils';
import { SLUG_REGEX } from './common/tenant/subdomain-resolver.service';

/**
 * Configures CORS on the given NestJS application.
 *
 * Allowed origins:
 *  1. Valid tenant subdomain of PLATFORM_ROOT_DOMAIN (e.g. sawa.deqah.net)
 *  2. Exact origins listed in CORS_ORIGINS (comma-separated)
 *  3. In non-production: standard local dev ports
 */
export function configureCors(app: INestApplication): void {
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || 'localhost';
  const escaped = rootDomain.replace(/\./g, '\\.');
  const wildcardRegex = new RegExp(`^https?://([a-z0-9-]+\\.)?${escaped}(:\\d+)?$`, 'i');
  const fixedAllowed = (process.env.CORS_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const devDefaults = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:5103', 'http://localhost:5104', 'http://localhost:5105'];
  const extraReserved = (process.env.RESERVED_SUBDOMAINS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const reserved = new Set([...DEFAULT_RESERVED_SUBDOMAINS, ...extraReserved]);

  app.enableCors({
    origin: (requestOrigin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!requestOrigin) return cb(null, true);
      if (wildcardRegex.test(requestOrigin)) {
        try {
          const url = new URL(requestOrigin);
          const host = url.host.toLowerCase();
          const rootDot = `.${rootDomain.toLowerCase()}`;
          if (host.endsWith(rootDot)) {
            const sub = host.slice(0, host.length - rootDot.length);
            if (sub && (isReservedSubdomain(sub, reserved) || !SLUG_REGEX.test(sub))) {
              return cb(new Error(`CORS blocked: ${requestOrigin}`), false);
            }
          }
        } catch {
          return cb(new Error(`CORS blocked: ${requestOrigin}`), false);
        }
        return cb(null, true);
      }
      if (fixedAllowed.includes(requestOrigin)) return cb(null, true);
      if (devDefaults.includes(requestOrigin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${requestOrigin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Org-Id'],
  });
}
