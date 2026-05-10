import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface AdminCancelScheduledCommand {
  organizationId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class AdminCancelScheduledHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: AdminCancelScheduledCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Reverses a scheduled cancellation (sets cancelAtPeriodEnd=false) on a foreign tenant's
    // Subscription; the row is scoped to the target org, not the acting super-admin's context.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { organizationId: cmd.organizationId },
        select: {
          id: true,
          organizationId: true,
          status: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          currentPeriodEnd: true,
        },
      });

      if (!subscription) {
        throw new NotFoundException(`No subscription found for organization ${cmd.organizationId}`);
      }

      if (!subscription.cancelAtPeriodEnd) {
        throw new BadRequestException(
          'Subscription does not have a scheduled cancellation (cancelAtPeriodEnd is false)',
        );
      }

      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false },
        select: {
          id: true,
          organizationId: true,
          status: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          currentPeriodEnd: true,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.BILLING_CHANGE_PLAN,
          organizationId: cmd.organizationId,
          reason: 'Scheduled cancellation reversed by super-admin',
          metadata: {
            subscriptionId: subscription.id,
            action: 'CANCEL_SCHEDULED_CANCELLATION',
          },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });
  }
}
