import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';
import { SubdomainResolverService } from './subdomain-resolver.service';
import { DEFAULT_ORGANIZATION_ID, TenantEnforcementMode } from './tenant.constants';
import { TenantResolutionError } from './tenant.errors';

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
   * Validates a header value as a well-formed UUID (RFC 4122, any version
   * including the all-zero placeholder used as DEFAULT_ORGANIZATION_ID).
   * Returns the trimmed value when valid, undefined otherwise.
   */
  private parseUuidHeader(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
      ? trimmed
      : undefined;
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

    // Priority:
    //   1. JWT claim (authenticated users)
    //   2. X-Org-Id header (super-admins only — never trusted from regular users)
    //   3. Subdomain resolver on public routes (CR-4) — maps <slug>.deqah.net to
    //      organizationId. When a subdomain is present, X-Org-Id MUST either match
    //      or be absent. Mismatch → 400 (cross-tenant header injection attack).
    //   4. X-Org-Id header on UNAUTHENTICATED public routes with NO subdomain
    //      (mobile tenant-lock: mobile hits raw API domain, no subdomain present).
    //   5. DEFAULT_ORGANIZATION_ID (permissive mode only)
    const fromSuperAdminHeader =
      req.user?.isSuperAdmin === true
        ? this.parseUuidHeader(req.headers['x-org-id'])
        : undefined;

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
        const headerOrgId = this.parseUuidHeader(req.headers['x-org-id']);
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
        ? this.parseUuidHeader(req.headers['x-org-id'])
        : undefined;

    const fromDefault =
      mode === 'permissive'
        ? this.config.get<string>('DEFAULT_ORGANIZATION_ID', DEFAULT_ORGANIZATION_ID)
        : undefined;

    const organizationId =
      fromSuperAdminHeader ?? fromJwt ?? fromSubdomain ?? fromPublicHeader ?? fromDefault;

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
