import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { DEFAULT_ORGANIZATION_ID, SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant';
import { PasswordService } from '../shared/password.service';
import { TokenService, TokenPair } from '../shared/token.service';
import type { LoginCommand } from './login.command';

const LOCKOUT_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;
const MAX_EMAIL_RATE_LIMIT = 10;
const MAX_IP_RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_SECONDS = 900;

export interface OrgSelectionMembership {
  organizationId: string;
  organizationNameAr: string;
  organizationNameEn: string | null;
  organizationSlug: string | null;
  role: string;
  logoUrl: string | null;
}

export interface OrgSelectionRequired {
  requires_org_selection: true;
  memberships: OrgSelectionMembership[];
}

export type LoginResult = TokenPair | OrgSelectionRequired;

@Injectable()
export class LoginHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly cls: ClsService,
    private readonly redis: RedisService,
  ) {}

  async execute(cmd: LoginCommand): Promise<LoginResult> {
    const ip = cmd.ip ?? 'unknown';
    const emailKey = `staff_login:email:${cmd.email}`;
    const ipKey = `staff_login:ip:${ip}`;
    const redisClient = this.redis.getClient();

    const [emailAttempts, ipAttempts] = await Promise.all([
      redisClient.incr(emailKey),
      redisClient.incr(ipKey),
    ]);

    if (emailAttempts === 1) await redisClient.expire(emailKey, RATE_LIMIT_WINDOW_SECONDS);
    if (ipAttempts === 1) await redisClient.expire(ipKey, RATE_LIMIT_WINDOW_SECONDS);

    if (emailAttempts > MAX_EMAIL_RATE_LIMIT || ipAttempts > MAX_IP_RATE_LIMIT) {
      await Promise.all([
        redisClient.expire(emailKey, RATE_LIMIT_WINDOW_SECONDS),
        redisClient.expire(ipKey, RATE_LIMIT_WINDOW_SECONDS),
      ]);
      throw new UnauthorizedException('Too many attempts, try again later');
    }

    try {
      const result = await this.doLogin(cmd);
      await Promise.all([redisClient.del(emailKey), redisClient.del(ipKey)]);
      return result;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await Promise.all([
          redisClient.expire(emailKey, RATE_LIMIT_WINDOW_SECONDS),
          redisClient.expire(ipKey, RATE_LIMIT_WINDOW_SECONDS),
        ]);
      }
      throw err;
    }
  }

  private async doLogin(cmd: LoginCommand): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: cmd.email },
      include: { customRole: { include: { permissions: true } } },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    if (!user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account locked. Try again later.');
    }

    const valid = await this.password.verify(cmd.password, user.passwordHash);

    if (!valid) {
      const newCount = user.failedLoginAttempts + 1;
      const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : newCount,
          ...(shouldLock
            ? { lockedUntil: new Date(Date.now() + LOCKOUT_WINDOW_MINUTES * 60 * 1000) }
            : {}),
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil !== null) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const activeMemberships = await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      return this.prisma.$allTenants.membership.findMany({
        where: { userId: user.id, isActive: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          organizationId: true,
          role: true,
          organization: {
            select: {
              nameAr: true,
              nameEn: true,
              slug: true,
            },
          },
        },
      });
    });

    if (!user.isSuperAdmin && activeMemberships.length === 0) {
      throw new UnauthorizedException('No active membership found for this account');
    }

    // Super-admins always get tokens immediately (no org context needed).
    if (user.isSuperAdmin) {
      return this.tokens.issueTokenPair(user, {
        organizationId: DEFAULT_ORGANIZATION_ID,
        membershipId: undefined,
        membershipRole: undefined,
        isSuperAdmin: true,
      });
    }

    // Resolve which membership to use.
    // Priority: organizationId hint → lastActiveOrganizationId → single-org direct.
    // When organizationId is provided but has no active membership → 401.
    // When multiple memberships exist and no hint resolves → defer to org-picker.

    if (cmd.organizationId) {
      const hinted = activeMemberships.find((m) => m.organizationId === cmd.organizationId);
      if (!hinted) {
        throw new UnauthorizedException('No active membership found for the requested organization');
      }
      return this.tokens.issueTokenPair(user, {
        organizationId: hinted.organizationId,
        membershipId: hinted.id,
        membershipRole: hinted.role ?? undefined,
        isSuperAdmin: false,
      });
    }

    // No explicit org hint: try sticky org, then single-org fast path.
    if (user.lastActiveOrganizationId) {
      const sticky = activeMemberships.find(
        (m) => m.organizationId === user.lastActiveOrganizationId,
      );
      if (sticky) {
        return this.tokens.issueTokenPair(user, {
          organizationId: sticky.organizationId,
          membershipId: sticky.id,
          membershipRole: sticky.role ?? undefined,
          isSuperAdmin: false,
        });
      }
    }

    if (activeMemberships.length === 1) {
      const [only] = activeMemberships;
      return this.tokens.issueTokenPair(user, {
        organizationId: only.organizationId,
        membershipId: only.id,
        membershipRole: only.role ?? undefined,
        isSuperAdmin: false,
      });
    }

    // Multiple memberships with no resolvable hint → ask the client to pick.
    return {
      requires_org_selection: true,
      memberships: activeMemberships.map((m) => {
        const org = m.organization as {
          nameAr: string;
          nameEn: string | null;
          slug: string | null;
        };
        return {
          organizationId: m.organizationId,
          organizationNameAr: org.nameAr,
          organizationNameEn: org.nameEn ?? null,
          organizationSlug: org.slug ?? null,
          role: m.role,
          logoUrl: null,
        };
      }),
    };
  }
}
