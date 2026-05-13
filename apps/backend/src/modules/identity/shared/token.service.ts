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

    const createRefreshToken = async (): Promise<void> => {
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          organizationId: tenantClaims.organizationId,
          tokenHash,
          tokenSelector,
          expiresAt,
        },
      });
    };

    if (this.cls && this.tenantCtx) {
      // Run inside a fresh CLS context so the Prisma tenant-scoping extension
      // can emit SET LOCAL app.current_org_id = ... before the INSERT, satisfying
      // the RLS WITH CHECK policy on RefreshToken. Login happens outside any
      // authenticated request context, so there is no outer CLS tenant — we
      // must establish one explicitly here.
      const ctx: TenantContext = {
        organizationId: tenantClaims.organizationId,
        membershipId: tenantClaims.membershipId ?? '',
        id: user.id,
        role: user.role,
        isSuperAdmin: tenantClaims.isSuperAdmin ?? false,
      };
      await this.cls.run(async () => {
        this.tenantCtx!.set(ctx);
        await createRefreshToken();
      });
    } else {
      // Fallback path: CLS not injected (unit-test context). Run directly.
      await createRefreshToken();
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
