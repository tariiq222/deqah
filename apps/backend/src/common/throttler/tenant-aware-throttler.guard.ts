import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Tracks rate limits per (ip, orgId) pair instead of per-ip alone.
 * Prevents one abusive tenant from starving co-located tenants behind
 * shared NAT / CDN edges, and prevents IP-only buckets from being
 * artificially shared across tenants on the same egress IP.
 *
 * Falls back to ip:anon for unauthenticated / unresolved requests.
 *
 * orgId resolution strategy (sync, no CLS injection needed):
 *   1. req.user.organizationId  — JWT-authenticated requests (most common)
 *   2. req.headers['x-org-id']  — unauthenticated public routes (mobile tenant-lock)
 *   3. undefined → 'anon'       — all other unauthenticated requests
 *
 * TenantResolverMiddleware stores the resolved context via ClsService only,
 * not as a property on the Express request object. Reading from req.user and
 * the X-Org-Id header directly gives us sync access to the same sources the
 * middleware itself uses (see tenant-resolver.middleware.ts, priority 1 & 3).
 *
 * Integration coverage: see app.module.ts and the E2E tenant-isolation suites.
 */
@Injectable()
export class TenantAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = await super.getTracker(req);
    const orgId = this.extractOrgId(req);
    return `${ip}:${orgId ?? 'anon'}`;
  }

  private extractOrgId(req: Record<string, unknown>): string | undefined {
    // Path 1: JWT-authenticated request — user is populated by JwtStrategy.
    //
    // TAR-10 note: super-admin X-Org-Id override (honored by JwtGuard for
    // tenant CONTEXT) is intentionally NOT mirrored into the throttler
    // bucket. Super-admin traffic is low-volume + trusted, so we keep
    // their rate-limit budget tied to their own JWT org (typically the
    // platform org). Reflecting the override here would let a single
    // super-admin exhaust per-tenant buckets while debugging.
    const user = req['user'] as { organizationId?: string } | undefined;
    if (user?.organizationId) {
      return user.organizationId;
    }

    // Path 2: unauthenticated public route carrying X-Org-Id (mobile tenant-lock)
    const headers = req['headers'] as Record<string, unknown> | undefined;
    const rawHeader = headers?.['x-org-id'];
    if (typeof rawHeader === 'string' && rawHeader.trim().length > 0) {
      return rawHeader.trim();
    }

    return undefined;
  }
}
