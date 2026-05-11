import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';
import { SubdomainResolverService } from './subdomain-resolver.service';
import { DEFAULT_ORGANIZATION_ID, TenantEnforcementMode } from './tenant.constants';
import { TenantResolutionError } from './tenant.errors';
import { parseUuidHeader } from './uuid-header.util';

interface AuthenticatedRequest extends Request {
  user?: {
    // Matches the shape attached by JwtStrategy.validate() — field is `id`,
    // not `userId`. Every guard/handler in the codebase already reads `id`.
    id?: string;
    organizationId?: string;
    membershipId?: string;
    role?: string;
    isSuperAdmin?: boolean;
  };
}

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(
    private readonly ctx: TenantContextService,
    private readonly config: ConfigService,
    private readonly subdomainResolver: SubdomainResolverService,
  ) {}

  /**
   * Public mobile routes that may resolve their tenant from the X-Org-Id
   * header. Webhook routes are excluded — they have their own system-context
   * resolution flow (see SaaS-02e moyasar-webhook).
   */
  private isPublicRoute(path: string): boolean {
    // Accept both prefixed (`/api/v1/public/...` in production) and bare
    // (`/public/...` in tests, where setGlobalPrefix is not applied).
    if (
      !path.startsWith('/api/v1/public/') &&
      !path.startsWith('/public/') &&
      !path.endsWith('/auth/login')
    ) {
      return false;
    }
    if (path.includes('/webhooks/')) return false;
    return true;
  }

  /**
   * Tenant-bootstrap routes that legitimately have no tenant yet — they
   * CREATE the tenant. Skip resolution entirely so strict mode doesn't
   * reject the request before the controller runs. These handlers must
   * call `tenant.set()` themselves once the org exists.
   */
  private isTenantBootstrapRoute(path: string): boolean {
    return (
      path.endsWith('/public/tenants/register') ||
      path.endsWith('/api/v1/public/tenants/register')
    );
  }

  /**
   * Auth-bootstrap routes that have no JWT and no org context yet — the
   * handlers themselves resolve or issue the tenant context after
   * authenticating the caller. Bypasses tenant resolution entirely so
   * strict mode does not reject requests before the controller runs.
   *
   * Scope: @Controller('auth') endpoints under global prefix api/v1.
   * - /auth/login    — LoginHandler resolves org from Membership after auth
   * - /auth/refresh  — issues new token pair; uses $allTenants internally
   * - /auth/logout   — revokes token; uses $allTenants internally
   *
   * NOT included: /public/auth/* (client auth — requires X-Org-Id from
   * mobile tenant-lock) and /mobile/auth/* (mobile — sends X-Org-Id header).
   */
  private isAuthBootstrapRoute(path: string): boolean {
    return (
      path.endsWith('/auth/login') ||
      path.endsWith('/auth/refresh') ||
      path.endsWith('/auth/logout') ||
      path.endsWith('/auth/otp/request-dashboard') ||
      path.endsWith('/auth/otp/verify-dashboard')
    );
  }

  /**
   * TAR-48: Detect a client-session credential on the request.
   *
   * Public routes that are protected by `ClientSessionGuard` carry their
   * tenant identity inside the client JWT (`organizationId` claim). The
   * guard runs AFTER this middleware and sets the tenant context itself
   * via `ClientJwtStrategy.validate()` / `ClientSessionGuard.handleRequest`.
   *
   * In strict mode, the middleware would otherwise reject these requests
   * before the guard has a chance to read the JWT — breaking cookie-only
   * client sessions on the raw API domain (no subdomain, no X-Org-Id).
   *
   * If a client-session token is present we defer tenant resolution to the
   * guard. The guard rejects invalid/expired tokens with 401, and the JWT
   * strategy sets the tenant context from the validated `organizationId`
   * claim (cross-checked against the Client row in DB).
   *
   * We deliberately do NOT decode/verify the JWT here — that is the guard's
   * job. We only check for token presence to choose the resolution strategy.
   */
  private hasClientSessionToken(req: AuthenticatedRequest): boolean {
    const cookieToken = (req as Request & { cookies?: Record<string, string> })
      .cookies?.client_access_token;
    if (typeof cookieToken === 'string' && cookieToken.length > 0) {
      return true;
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      return true;
    }
    return false;
  }


  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    const mode = this.config.get<TenantEnforcementMode>('TENANT_ENFORCEMENT', 'strict');

    if (mode === 'off') {
      return next();
    }

    const path = req.originalUrl ?? req.url ?? req.path ?? '';
    if (this.isTenantBootstrapRoute(path)) {
      return next();
    }

    if (this.isAuthBootstrapRoute(path)) {
      return next();
    }

    const isPublicRoute = this.isPublicRoute(path);

    // Priority (TAR-10: super-admin X-Org-Id override is enforced by JwtGuard
    // because Nest middleware runs before Passport — `req.user` is unavailable
    // here. This middleware only handles unauthenticated paths.):
    //   1. JWT claim (authenticated users) — stamped by JwtGuard, NOT here.
    //   2. Subdomain resolver on public routes (CR-4) — maps <slug>.deqah.net to
    //      organizationId. When a subdomain is present, X-Org-Id MUST either match
    //      or be absent. Mismatch → 400 (cross-tenant header injection attack).
    //   3. X-Org-Id header on UNAUTHENTICATED public routes with NO subdomain
    //      (mobile tenant-lock: mobile hits raw API domain, no subdomain present).
    //   4. DEFAULT_ORGANIZATION_ID (permissive mode only)
    if (!isPublicRoute && !req.user) {
      if (mode === 'permissive') {
        this.ctx.set({
          organizationId: this.config.get<string>(
            'DEFAULT_ORGANIZATION_ID',
            DEFAULT_ORGANIZATION_ID,
          ),
          membershipId: '',
          id: '',
          role: '',
          isSuperAdmin: false,
        });
      }
      return next();
    }

    const fromJwt = req.user?.organizationId;

    // CR-4: Subdomain binding on public routes.
    // Only resolve subdomain for unauthenticated public requests — JWT-authenticated
    // requests always use the JWT claim, and super-admin override is handled above.
    let fromSubdomain: string | null = null;
    if (!req.user && isPublicRoute) {
      const hostHeader =
        (req.headers['x-forwarded-host'] as string | undefined) ??
        req.hostname ??
        (req.headers.host as string | undefined);
      fromSubdomain = await this.subdomainResolver.resolve(hostHeader);

      if (fromSubdomain) {
        // Subdomain resolved — validate X-Org-Id header consistency.
        const headerOrgId = parseUuidHeader(req.headers['x-org-id']);
        if (headerOrgId !== undefined && headerOrgId !== fromSubdomain) {
          // A forged / mismatched X-Org-Id is an attempted cross-tenant bypass.
          throw new BadRequestException('X-Org-Id does not match the resolved subdomain organization');
        }
        // Subdomain wins; header is either absent or already matches.
      }
    }

    // X-Org-Id on public routes: only honored when NO subdomain was resolved
    // (i.e. mobile hitting the raw API domain without a tenant subdomain).
    const fromPublicHeader =
      !req.user && isPublicRoute && !fromSubdomain
        ? parseUuidHeader(req.headers['x-org-id'])
        : undefined;

    // TAR-48: Client-session public routes (e.g. /public/me, /public/invoices,
    // /public/refunds, /public/auth/refresh, /public/auth/logout, /public/bookings)
    // carry tenant identity in the client JWT itself. When the request reaches
    // the raw API domain with only a session cookie (no subdomain, no header),
    // defer tenant resolution to ClientSessionGuard rather than rejecting the
    // request here. The guard runs after this middleware, validates the JWT,
    // and sets tenant context from the verified `organizationId` claim.
    //
    // Truly unauthenticated public routes (no token at all) still fall through
    // to the strict-mode rejection below — the acceptance criterion that
    // "unauthenticated public routes still require subdomain or X-Org-Id" is
    // preserved.
    if (
      !req.user &&
      isPublicRoute &&
      !fromSubdomain &&
      fromPublicHeader === undefined &&
      this.hasClientSessionToken(req)
    ) {
      return next();
    }

    const fromDefault =
      mode === 'permissive'
        ? this.config.get<string>('DEFAULT_ORGANIZATION_ID', DEFAULT_ORGANIZATION_ID)
        : undefined;

    // fromJwt is included as a defensive fallback for the rare case of an
    // authenticated PUBLIC route where JwtGuard did not run (public routes
    // bypass it). JwtGuard is the primary path for authenticated requests.
    const organizationId =
      fromJwt ?? fromSubdomain ?? fromPublicHeader ?? fromDefault;

    if (!organizationId) {
      throw new TenantResolutionError(
        'Unable to resolve tenant — no JWT claim, no valid header, strict mode active',
      );
    }

    this.ctx.set({
      organizationId,
      membershipId: req.user?.membershipId ?? '',
      id: req.user?.id ?? '',
      role: req.user?.role ?? '',
      isSuperAdmin: req.user?.isSuperAdmin === true,
    });

    next();
  }
}
