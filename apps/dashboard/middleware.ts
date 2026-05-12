import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware — Deqah Dashboard
 *
 * Auth protection is handled entirely client-side by AuthGate (fetchMe + refresh).
 * The middleware only passes requests through without blocking navigation.
 *
 * NOTE: The refresh_token is an httpOnly cookie set by the backend on a different
 * origin (localhost:3100 in dev), so it is NOT visible to this middleware.
 * Blocking here would break all client-side navigation via router.push().
 *
 * For /api/proxy/* requests, the original Host header is forwarded via
 * x-forwarded-host so that the backend SubdomainResolverService can resolve
 * the tenant from the subdomain.
 *
 * Subdomain validation:
 * - Root domain and non-deqah hosts pass through without a backend check.
 * - Reserved subdomains (www, api, admin, …) pass through immediately.
 * - Malformed slugs (fail regex) are rewritten to /workspace-not-found.
 * - Valid unknown slugs are verified against /api/v1/tenants/exists.
 *   Missing tenants → /workspace-not-found. Fail-open on network errors.
 */

const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'app', 'assets', 'auth', 'billing', 'blog', 'cdn',
  'dashboard', 'deqah', 'dev', 'docs', 'errors', 'files', 'ftp', 'grafana',
  'help', 'login', 'mail', 'media', 'metrics', 'monitoring', 'mx', '_next',
  'ns', 'prod', 'production', 'prometheus', 'public', 'qa', 'register', 'root',
  'settings', 'signup', 'smtp', 'socket', 'staging', 'static', 'status',
  'support', 'system', 'test', 'webhook', 'webhooks', 'ws',
]);

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

interface TenantExistsResult {
  exists: boolean;
  organizationId?: string;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const rawHost = req.headers.get('host') ?? '';
  const hostname = rawHost.split(':')[0].toLowerCase();

  const rootDomain =
    process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? 'deqah.net';

  // Build the mutated headers we will forward on every response.
  const forwardHeaders = new Headers(req.headers);
  if (!forwardHeaders.has('x-forwarded-host')) {
    forwardHeaders.set('x-forwarded-host', hostname);
  }

  // 1. Exact root domain match — pass through (e.g. deqah.net, staging.deqah.net).
  if (hostname === rootDomain) {
    return NextResponse.next({ request: { headers: forwardHeaders } });
  }

  // 2. Not a subdomain of our root domain — pass through (localhost, IPs, previews).
  if (!hostname.endsWith(`.${rootDomain}`)) {
    return NextResponse.next({ request: { headers: forwardHeaders } });
  }

  // Extract the leftmost subdomain label.
  const sub = hostname.slice(0, hostname.length - rootDomain.length - 1);

  // 3. Reserved subdomain — pass through.
  if (RESERVED_SUBDOMAINS.has(sub)) {
    return NextResponse.next({ request: { headers: forwardHeaders } });
  }

  // 4. Malformed slug — rewrite immediately, no backend call.
  if (!SLUG_REGEX.test(sub)) {
    return NextResponse.rewrite(
      new URL(
        `/workspace-not-found?subdomain=${encodeURIComponent(sub)}`,
        req.url,
      ),
    );
  }

  // 5. Valid slug — verify existence against the backend.
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5100/api/v1';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    let res: Response;
    try {
      res = await fetch(`${apiBase}/tenants/exists`, {
        headers: { 'x-forwarded-host': hostname },
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      // Non-2xx — fail-open.
      console.warn(
        `[middleware] tenant existence check non-2xx (${res.status}) for host=${rawHost}`,
      );
      return NextResponse.next({ request: { headers: forwardHeaders } });
    }

    const body = (await res.json()) as TenantExistsResult;

    if (body.exists) {
      if (body.organizationId) {
        forwardHeaders.set('x-organization-id', body.organizationId);
      }
      return NextResponse.next({ request: { headers: forwardHeaders } });
    }

    // Tenant does not exist.
    return NextResponse.rewrite(
      new URL(
        `/workspace-not-found?subdomain=${encodeURIComponent(sub)}`,
        req.url,
      ),
    );
  } catch (err) {
    // Fail-open — never take down the platform due to a transient backend error.
    console.warn(
      `[middleware] tenant existence check failed for host=${rawHost}: ${String(err)}`,
    );
    return NextResponse.next({ request: { headers: forwardHeaders } });
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)).*)',
    '/api/proxy/:path*',
  ],
};
