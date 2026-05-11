import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../infrastructure/database';
import { RedisService } from '../../infrastructure/cache';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ALLOW_DURING_SUSPENSION_KEY } from './allow-during-suspension.decorator';

export const IS_PUBLIC_KEY = 'isPublic';
const ORG_SUSPENSION_CACHE_TTL_SECONDS = 30;
const ACTIVE_ORG_CACHE_SENTINEL = 'active';

// RFC 4122 UUID (any version, including the all-zero placeholder used as
// DEFAULT_ORGANIZATION_ID). Used to validate the X-Org-Id super-admin
// override header before honoring it.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUSPENSION_HINT_AR =
  'حسابك معلّق. صاحب الحساب يمكنه تحديث طريقة الدفع لإعادة التفعيل.';
const SUSPENSION_HINT_EN =
  'Your organization is suspended. The owner can update the payment method to reactivate.';

/** Mark a route as public — skips JWT validation. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

interface AuthenticatedReqUser {
  id?: string;
  sub?: string;
  organizationId?: string;
  membershipId?: string;
  role?: string;
  membershipRole?: string;
  isSuperAdmin?: boolean;
  scope?: string;
  impersonationSessionId?: string;
}

/**
 * JWT guard — validates Bearer token on every route by default.
 * Routes decorated with @Public() are exempt.
 *
 * Bug B10: routes decorated with @AllowDuringSuspension() bypass the
 * suspended-org check ONLY when the caller is the OWNER, so suspended
 * tenants can self-serve a payment-method update.
 */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContextService,
  ) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (isPublic) return true;

    const activated = await Promise.resolve(super.canActivate(ctx));
    const req = ctx.switchToHttp().getRequest<{
      user?: AuthenticatedReqUser;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    this.stampTenantContext(req.user, req.headers);

    const allowDuringSuspension = this.reflector.getAllAndOverride<boolean>(
      ALLOW_DURING_SUSPENSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    await this.assertOrganizationIsActive(
      req.user?.organizationId,
      {
        allowDuringSuspension: allowDuringSuspension === true,
        membershipRole: req.user?.membershipRole,
      },
    );
    await this.assertImpersonationSessionIsLive(req.user);
    return activated as boolean;
  }

  // SaaS-05b — shadow JWTs (scope='impersonation') are valid only as long
  // as the corresponding ImpersonationSession is active in the DB and not
  // explicitly revoked in Redis. The shadow JWT itself is short-lived
  // (15 min) but a super-admin can end the session manually before that
  // TTL elapses; this check enforces that immediately.
  async assertImpersonationSessionIsLive(user?: {
    scope?: string;
    impersonationSessionId?: string;
  }): Promise<void> {
    if (user?.scope !== 'impersonation') return;
    if (!user.impersonationSessionId) {
      throw new UnauthorizedException('IMPERSONATION_INVALID');
    }

    const redis = this.redis.getClient();
    const revoked = await redis.get(
      `impersonation-revoked:${user.impersonationSessionId}`,
    );
    if (revoked) throw new UnauthorizedException('IMPERSONATION_REVOKED');

    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: user.impersonationSessionId },
      select: { endedAt: true, expiresAt: true },
    });
    if (!session) throw new UnauthorizedException('IMPERSONATION_INVALID');
    if (session.endedAt) throw new UnauthorizedException('IMPERSONATION_ENDED');
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('IMPERSONATION_EXPIRED');
    }
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser,
    _info: unknown,
    _ctx: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }

  async assertOrganizationIsActive(
    organizationId?: string,
    options: {
      allowDuringSuspension?: boolean;
      membershipRole?: string;
    } = {},
  ): Promise<void> {
    if (!organizationId) return;

    const redis = this.redis.getClient();
    const key = this.buildOrgSuspensionCacheKey(organizationId);
    const cached = await redis.get(key);

    if (cached === ACTIVE_ORG_CACHE_SENTINEL) return;
    if (cached) {
      this.rejectSuspended(options);
      return;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { suspendedAt: true },
    });

    const cacheValue =
      organization?.suspendedAt?.toISOString() ?? ACTIVE_ORG_CACHE_SENTINEL;
    await redis.set(key, cacheValue, 'EX', ORG_SUSPENSION_CACHE_TTL_SECONDS);

    if (organization?.suspendedAt) {
      this.rejectSuspended(options);
    }
  }

  /**
   * Throws ORG_SUSPENDED unless the route opted into recovery mode AND the
   * caller is OWNER. Anything else (ADMIN, RECEPTIONIST, missing role) on a
   * suspended org is rejected with the bilingual recovery hint.
   */
  private rejectSuspended(options: {
    allowDuringSuspension?: boolean;
    membershipRole?: string;
  }): void {
    if (
      options.allowDuringSuspension === true &&
      options.membershipRole === 'OWNER'
    ) {
      return;
    }
    throw new UnauthorizedException({
      code: 'ORG_SUSPENDED',
      message: 'ORG_SUSPENDED',
      messageAr: SUSPENSION_HINT_AR,
      messageEn: SUSPENSION_HINT_EN,
      recoveryHint: {
        ar: SUSPENSION_HINT_AR,
        en: SUSPENSION_HINT_EN,
      },
    });
  }

  private buildOrgSuspensionCacheKey(organizationId: string): string {
    return `org-suspension:${organizationId}`;
  }

  /**
   * Stamps the per-request tenant context from the authenticated user.
   *
   * Runs after Passport has populated `req.user`, so this is the canonical
   * point to resolve tenant for authenticated requests (TAR-10). The
   * TenantResolverMiddleware now only handles unauthenticated paths
   * (public routes, subdomain binding, auth-bootstrap bypass).
   *
   * Super-admin override: when `user.isSuperAdmin === true` and a
   * well-formed UUID `X-Org-Id` header is present, that org wins over the
   * super-admin's own JWT `organizationId` claim. This is how platform
   * operators inspect / act on a specific tenant. The header is ignored
   * for non-super-admin users (security: never trust caller-supplied org).
   */
  private stampTenantContext(
    user?: AuthenticatedReqUser,
    headers?: Record<string, string | string[] | undefined>,
  ): void {
    if (!user) return;

    const overrideOrgId =
      user.isSuperAdmin === true
        ? this.parseUuidHeader(headers?.['x-org-id'])
        : undefined;
    const organizationId = overrideOrgId ?? user.organizationId;

    if (!organizationId) return;

    this.tenantContext.set({
      organizationId,
      membershipId: user.membershipId ?? '',
      id: user.id ?? user.sub ?? '',
      role: user.role ?? '',
      isSuperAdmin: user.isSuperAdmin === true,
    });
  }

  /**
   * Validates a header value as a well-formed UUID. Mirrors the helper in
   * TenantResolverMiddleware — duplicated here to keep guard tenant
   * resolution self-contained (avoids a cross-module import cycle with
   * the tenant module, which depends on guards transitively).
   */
  private parseUuidHeader(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return UUID_REGEX.test(trimmed) ? trimmed : undefined;
  }
}
