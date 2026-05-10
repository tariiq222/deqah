import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { PasswordService } from '../shared/password.service';
import type {
  AcceptInvitationCommand,
  AcceptInvitationResult,
} from './accept-invitation.command';

/**
 * Resolve a pending invitation token into an active Membership.
 *
 *  - If the invited email already has a User → link a new Membership silently.
 *  - If not → create a new User (password + name required), then Membership.
 *  - Idempotent on the invitation: status flips PENDING → ACCEPTED in a tx.
 *  - Expired or already-used tokens return GoneException so the UI can show
 *    a clear "request a new invitation" page.
 */
@Injectable()
export class AcceptInvitationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: AcceptInvitationCommand): Promise<AcceptInvitationResult> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: cmd.token },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    if (invitation.status !== 'PENDING') {
      throw new GoneException('Invitation is no longer valid');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      // Lazily mark expired so the next caller hits the same branch.
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new GoneException('Invitation has expired');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, isActive: true },
    });

    if (existingUser && !existingUser.isActive) {
      // Defensive: an inactive account cannot accept invites — but we do not
      // disclose whether the email exists. Return the same generic gone path.
      throw new GoneException('Invitation cannot be accepted');
    }

    return this.rlsTx.withTransaction(async (tx) => {
      let userId: string;
      let userPreExisting: boolean;

      if (existingUser) {
        userId = existingUser.id;
        userPreExisting = true;
      } else {
        if (!cmd.password || !cmd.name) {
          throw new BadRequestException('Password and name are required for new accounts');
        }
        const passwordHash = await this.password.hash(cmd.password);
        const created = await tx.user.create({
          data: {
            email: invitation.email,
            name: cmd.name.trim(),
            passwordHash,
            isActive: true,
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        });
        userId = created.id;
        userPreExisting = false;
      }

      // upsert protects against the rare race where the same user already
      // gained a membership in this org via another path (concurrent invite,
      // for instance) — we still flip the invitation to ACCEPTED below.
      const membership = await tx.membership.upsert({
        where: {
          userId_organizationId: { userId, organizationId: invitation.organizationId },
        },
        create: {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
          isActive: true,
          acceptedAt: new Date(),
          displayName: invitation.displayName,
          jobTitle: invitation.jobTitle,
        },
        update: {
          isActive: true,
          acceptedAt: new Date(),
          // Only fill display fields when not already set, to respect prior
          // user customizations.
          ...(invitation.displayName ? { displayName: invitation.displayName } : {}),
          ...(invitation.jobTitle ? { jobTitle: invitation.jobTitle } : {}),
        },
        select: { id: true, organizationId: true },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      return {
        membershipId: membership.id,
        organizationId: membership.organizationId,
        userPreExisting,
      };
    });
  }
}
