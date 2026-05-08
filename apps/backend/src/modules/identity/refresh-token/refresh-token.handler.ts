import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../infrastructure/database';
import { DEFAULT_ORGANIZATION_ID } from '../../../common/tenant';
import { TokenService, TokenPair } from '../shared/token.service';
import type { RefreshTokenCommand } from './refresh-token.command';

@Injectable()
export class RefreshTokenHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async execute(cmd: RefreshTokenCommand): Promise<TokenPair> {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId: cmd.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    let matched: (typeof candidates)[0] | undefined;
    for (const c of candidates) {
      if (await bcrypt.compare(cmd.rawToken, c.tokenHash)) { matched = c; break; }
    }

    if (!matched) throw new UnauthorizedException('Invalid or expired refresh token');

    // Conditional revoke: if a concurrent request already consumed this token,
    // updateMany with `revokedAt: null` will affect 0 rows and we reject —
    // mirrors the safe pattern in client-refresh.handler.ts. Plain update()
    // is unconditional and would let two parallel /auth/refresh calls each
    // mint a fresh token pair from the same one-time refresh token.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: matched.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: cmd.userId },
      include: { customRole: { include: { permissions: true } } },
    });

    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    // Resolve current membership role for the org on the refresh token so
    // the new JWT carries an up-to-date membershipRole claim.
    const orgId = matched.organizationId ?? DEFAULT_ORGANIZATION_ID;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: cmd.userId, organizationId: orgId } },
      select: { id: true, role: true },
    });

    // Carry the tenant through the refresh cycle. DEFAULT_ORGANIZATION_ID is
    // the safety net for tokens issued before the SaaS-02a backfill — should
    // be zero in prod once the backfill migration runs.
    return this.tokens.issueTokenPair(user, {
      organizationId: orgId,
      membershipId: membership?.id,
      membershipRole: membership?.role ?? undefined,
      isSuperAdmin: user.isSuperAdmin ?? false,
    });
  }
}
