import { Injectable, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContext, TenantContextService } from '../../../common/tenant';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * SaaS-02a — per-session tenant identity merged into the JWT payload.
 * Required: every session belongs to exactly one organization.
 */
export interface TenantClaims {
  organizationId: string;
  membershipId?: string;
  /** Per-org role from Membership.role — authoritative for staff users in SaaS multi-tenancy. */
  membershipRole?: string;
  isSuperAdmin?: boolean;
  scope?: string;
  impersonationSessionId?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  /** @deprecated — Use membershipRole for per-org authorization. Kept during Phase A/B rollout. */
  role: string;
  /** Per-org role from Membership.role (phase-A dual-carry). Undefined in pre-rollout tokens. */
  membershipRole?: string;
  customRoleId: string | null;
  permissions: Array<{ action: string; subject: string }>;
  features: string[];
  // Newly issued tokens always carry these three (SaaS-02a onward). Kept
  // optional because a decoded JwtPayload might represent a pre-rollout
  // token still in circulation during the rollout window.
  organizationId?: string;
  membershipId?: string;
  isSuperAdmin?: boolean;
  scope?: string;
  impersonationSessionId?: string;
  // P0-6: Session invalidation via tokenVersion. If the JWT's tokenVersion
  // does not match the User.tokenVersion in the DB, the session is stale.
  tokenVersion?: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly cls?: ClsService,
    @Optional() private readonly tenantCtx?: TenantContextService,
  ) {}

  async issueTokenPair(
    user: {
      id: string;
      email: string;
      role: string;
      customRoleId: string | null;
      customRole: { permissions: Array<{ action: string; subject: string }> } | null;
      tokenVersion: number;
    },
    tenantClaims: TenantClaims,
  ): Promise<TokenPair> {
    const permissions = user.customRole?.permissions ?? [];
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      membershipRole: tenantClaims.membershipRole,
      customRoleId: user.customRoleId,
      permissions,
      features: [],
      organizationId: tenantClaims.organizationId,
      membershipId: tenantClaims.membershipId,
      isSuperAdmin: tenantClaims.isSuperAdmin ?? false,
      scope: tenantClaims.scope,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
    });

    const rawRefresh = randomUUID();
    const tokenSelector = rawRefresh.slice(0, 8);
    const tokenHash = await bcrypt.hash(rawRefresh, 10);
    const ttl = this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';
    const expiresAt = new Date(Date.now() + this.parseTtlMs(ttl));

    // UUID_RE mirrors the validation in RlsHelper.applyInTransaction —
    // defense-in-depth before passing orgId into set_config (Prisma's tagged
    // template already parameterizes the value; this is an extra guard).
    const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

    /**
     * Run the INSERT inside a Prisma transaction and call
     * set_config('app.current_org_id', orgId, true) on the tx connection
     * BEFORE the INSERT. RLS lives in Postgres and reads this GUC — it cannot
     * see JS-side CLS state. Login runs before any request-level
     * TenantGucInterceptor, so we must set the GUC explicitly here.
     */
    const writeRefreshToken = async (): Promise<void> => {
      await this.prisma.$transaction(async (tx) => {
        if (!UUID_RE.test(tenantClaims.organizationId)) {
          throw new Error('TokenService: invalid orgId shape');
        }
        await tx.$queryRaw`SELECT set_config('app.current_org_id', ${tenantClaims.organizationId}, true)`;
        await tx.refreshToken.create({
          data: {
            userId: user.id,
            organizationId: tenantClaims.organizationId,
            tokenHash,
            tokenSelector,
            expiresAt,
          },
        });
      });
    };

    if (this.cls && this.tenantCtx) {
      // Also populate CLS so the audit interceptor and Prisma extension's
      // where-injection have tenant context for any sub-queries within this
      // async chain. The GUC set inside the transaction is what actually
      // satisfies the RLS WITH CHECK policy on RefreshToken.
      const ctx: TenantContext = {
        organizationId: tenantClaims.organizationId,
        membershipId: tenantClaims.membershipId ?? '',
        id: user.id,
        role: user.role,
        isSuperAdmin: tenantClaims.isSuperAdmin ?? false,
      };
      await this.cls.run(async () => {
        this.tenantCtx!.set(ctx);
        await writeRefreshToken();
      });
    } else {
      // Fallback path: CLS not injected (unit-test context). Run directly.
      await writeRefreshToken();
    }

    return { accessToken, refreshToken: rawRefresh };
  }

  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 30 * 24 * 60 * 60 * 1000;
    const n = parseInt(match[1], 10);
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return n * multipliers[match[2]];
  }
}
