import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface DeletePlanCommand {
  planId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

// Soft-delete by flipping isActive=false. We never hard-delete because
// SubscriptionInvoices reference the plan for audit history.
@Injectable()
export class DeletePlanHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: DeletePlanCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Soft-deletes a platform-wide Plan row (isActive=false); Plan has no organizationId
    // and is unreachable under RLS, so a bypass is required.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const plan = await tx.plan.findUnique({
        where: { id: cmd.planId },
        select: { id: true, isActive: true, _count: { select: { subscriptions: true } } },
      });
      if (!plan) throw new NotFoundException('plan_not_found');
      if (!plan.isActive) throw new ConflictException('plan_already_inactive');
      if (plan._count.subscriptions > 0) {
        // We still allow soft-delete (sunset) — but block if active subs exist.
        const activeCount = await tx.subscription.count({
          where: { planId: cmd.planId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
        });
        if (activeCount > 0) throw new ConflictException('plan_has_active_subscriptions');
      }

      await tx.plan.update({
        where: { id: cmd.planId },
        data: { isActive: false },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.PLAN_DELETE,
          organizationId: null,
          reason: null,
          metadata: { planId: cmd.planId, softDelete: true },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });
    });
  }
}
