import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../infrastructure/database';
import { SYSTEM_CONTEXT_CLS_KEY } from '../../common/tenant/tenant.constants';
import { CaslAbilityFactory } from './casl/casl-ability.factory';
import type { JwtPayload } from './shared/token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly casl: CaslAbilityFactory,
    private readonly cls: ClsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Auth bootstrap chicken-and-egg: the tenant context isn't established
    // until *after* this strategy resolves the user, but the nested include
    // touches CustomRole + Permission (both in SCOPED_MODELS — see
    // apps/backend/src/infrastructure/database/prisma.service.ts). Under
    // strict mode the scoping extension would throw because no tenant is in
    // CLS yet. Mirror the documented bypass used by webhook/OTP handlers
    // (e.g. verify-email.handler.ts): run the lookup inside a *fresh* CLS
    // child scope with `systemContext = true`, so the bypass flag stays
    // contained and never bleeds into a parent request store. The
    // cross-tenant check below restores the guarantee that the scoping
    // extension was previously providing.
    this.logger.debug(`systemContext bypass for JWT bootstrap (sub=${payload.sub})`);
    const user = await this.cls.run(async () => {
      this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);
      return this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { customRole: { include: { permissions: true } } },
      });
    });

    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    // Cross-tenant safety: the bypass above disables tenant scoping for the
    // lookup, so we must re-assert that the loaded customRole belongs to the
    // org the JWT claims. Super-admins are exempt (they legitimately operate
    // across orgs). Any non-super-admin token carrying a customRole MUST
    // also carry an organizationId — pre-rollout tokens without an org
    // claim are rejected outright rather than silently trusted.
    // Use the DB-authoritative `user.isSuperAdmin` flag (not the JWT claim)
    // so a revoked super-admin token cannot bypass this check.
    if (user.customRole && user.isSuperAdmin !== true) {
      if (
        !payload.organizationId ||
        user.customRole.organizationId !== payload.organizationId
      ) {
        throw new UnauthorizedException('Custom role does not belong to the token org');
      }
    }

    // Reject non-superadmin tokens that are missing the org claim.
    // Pre-rollout tokens (no organizationId) should no longer circulate;
    // issueTokenPair always sets organizationId. A missing claim means a
    // forged or severely outdated token — reject it.
    if (!user.isSuperAdmin && !payload.organizationId) {
      throw new UnauthorizedException('Token missing tenant claim');
    }

    // TAR-43: verify non-superadmin token has an active membership in the claimed org
    if (!user.isSuperAdmin && payload.organizationId) {
      const membership = await this.cls.run(async () => {
        this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);
        return this.prisma.membership.findFirst({
          where: {
            userId: user.id,
            organizationId: payload.organizationId,
            isActive: true,
          },
          select: { id: true },
        });
      });
      if (!membership) {
        throw new UnauthorizedException('No active membership in claimed organization');
      }
    }

    // P0-6: If the JWT carries a tokenVersion, verify it matches the DB value.
    // Stale tokenVersion means the session was revoked (logout/switch-org/password change).
    if (typeof payload.tokenVersion === 'number' && user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }

    // Build CASL ability against the canonical per-org role from the JWT.
    // `user.role` (the global User.role) is legacy and must NOT drive tenant
    // authz — see Role precedence in apps/backend/CLAUDE.md. The factory
    // falls back to `user.role` only when `membershipRole` is absent (pre-
    // rollout tokens / platform surfaces with no tenant context).
    const ability = this.casl.buildForUser({
      membershipRole: payload.membershipRole,
      role: user.role,
      customRole: user.customRole,
    });

    return {
      // Both `id` and `sub` carry the same User.id. The codebase has historic
      // splits — tenant middleware + half the controllers read `user.id`,
      // while admin/impersonation + mobile/employee controllers read
      // `user.sub`. Exposing both keeps every audit-trail call site correct
      // until the codebase is unified on `id` (separate cleanup ticket).
      id: user.id,
      sub: user.id,
      email: user.email,
      role: user.role,
      membershipRole: payload.membershipRole, // phase-A: now available on req.user
      customRoleId: user.customRoleId,
      permissions: ability.rules.flatMap((r) => {
        const actions = Array.isArray(r.action) ? r.action : [r.action];
        return actions.map((a) => ({ action: String(a), subject: String(r.subject) }));
      }),
      features: payload.features ?? [],
      // SaaS-01 — tenant claims passed through from JWT. Undefined in off/legacy tokens.
      organizationId: payload.organizationId,
      membershipId: payload.membershipId,
      isSuperAdmin: user.isSuperAdmin === true,
      scope: payload.scope,
      impersonationSessionId: payload.impersonationSessionId,
    };
  }
}
