import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database';

/**
 * Restricts an endpoint to a small allowlist of owner emails defined by the
 * OWNER_EMAILS env var (comma-separated, lowercased on compare). Runs AFTER
 * SuperAdminGuard so the user is already authenticated as a super-admin.
 *
 * Reads the user's email from the database to avoid trusting a stale JWT
 * claim. Cost: one extra User.findUnique per request — acceptable on the
 * low-volume owner-only flows (refund / waive / grant / change-plan / etc.).
 */
@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  private readonly logger = new Logger(OwnerOnlyGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId = req.user?.sub ?? req.user?.id;
    if (!userId) throw new ForbiddenException('owner_only');

    const ownerEmails = (process.env.OWNER_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (ownerEmails.length === 0) {
      this.logger.error('OWNER_EMAILS env not configured — refusing all owner-only requests');
      throw new ForbiddenException('owner_emails_not_configured');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const userEmail = user?.email?.toLowerCase();
    if (!userEmail || !ownerEmails.includes(userEmail)) {
      throw new ForbiddenException('owner_only');
    }

    return true;
  }
}
