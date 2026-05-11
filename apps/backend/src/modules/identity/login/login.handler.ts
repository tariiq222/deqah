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

@Injectable()
export class LoginHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly cls: ClsService,
    private readonly redis: RedisService,
  ) {}

  async execute(cmd: LoginCommand): Promise<TokenPair> {
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

  private async doLogin(cmd: LoginCommand): Promise<TokenPair> {
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
        select: { id: true, organizationId: true, role: true },
      });
    });
    const sticky = user.lastActiveOrganizationId
      ? activeMemberships.find(
          (m) => m.organizationId === user.lastActiveOrganizationId,
        ) ?? null
      : null;
    const membership = sticky ?? activeMemberships[0] ?? null;

    if (!user.isSuperAdmin && !membership) {
      throw new UnauthorizedException('No active membership found for this account');
    }

    return this.tokens.issueTokenPair(user, {
      organizationId: membership?.organizationId ?? DEFAULT_ORGANIZATION_ID,
      membershipId: membership?.id,
      membershipRole: membership?.role ?? undefined,
      isSuperAdmin: user.isSuperAdmin ?? false,
    });
  }
}
