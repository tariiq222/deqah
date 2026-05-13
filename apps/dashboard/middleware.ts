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
const TENANT_HOST_HEADER = 'x-deqah-tenant-host';

interface TenantExistsResult {
  exists: boolean;
  organizationId?: string;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const rawHost = req.headers.get('host') ?? '';
  const hostname = rawHost.split(':')[0].toLowerCase();

  const rootDomain =
    process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN ?? 'deqah.net';

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5100/api/v1';

  // Build the mutated headers we will forward on every response.
  const forwardHeaders = new Headers(req.headers);
  if (!forwardHeaders.has('x-forwarded-host')) {
    forwardHeaders.set('x-forwarded-host', hostname);
  }
  // Always stamp the original hostname so it survives upstream proxy rewrites
  // (Cloudflare → Traefik clobbers x-forwarded-host; x-deqah-tenant-host is
  // a custom header that passes through untouched).
  forwardHeaders.set(TENANT_HOST_HEADER, hostname);

  // --------------------------------------------------------------------------
  // Proxy /api/proxy/* directly to the backend so that custom headers survive.
  // next.config.mjs rewrites do NOT forward headers mutated in middleware to
  // external destinations (Next.js internal behaviour), so we proxy here.
  // --------------------------------------------------------------------------
  if (req.nextUrl.pathname.startsWith('/api/proxy/')) {
    const path = req.nextUrl.pathname.replace('/api/proxy', '');
    const search = req.nextUrl.search;
    const destination = `${apiBase}${path}${search}`;

    const proxyHeaders = new Headers(forwardHeaders);
    // Let fetch manage hop-by-hop headers; preserve the rest.
    proxyHeaders.delete('content-length');
    proxyHeaders.delete('host');

    const init: RequestInit = {
      method: req.method,
      headers: proxyHeaders,
      body: req.body,
      // @ts-expect-error — duplex required for streaming body proxy in Node 18+
      duplex: 'half',
    };

    try {
      const proxyRes = await fetch(destination, init);
      return new Response(proxyRes.body, {
        status: proxyRes.status,
        statusText: proxyRes.statusText,
        headers: proxyRes.headers,
      }) as unknown as NextResponse;
    } catch (err) {
      console.error(
        `[middleware] proxy fetch failed for ${destination}: ${String(err)}`,
      );
      return new Response(
        JSON.stringify({ error: 'proxy_error', message: 'Backend unreachable' }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      ) as unknown as NextResponse;
    }
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
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    let res: Response;
    try {
      res = await fetch(`${apiBase}/tenants/exists`, {
        headers: {
          [TENANT_HOST_HEADER]: hostname,
          'x-forwarded-host': hostname,
        },
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
