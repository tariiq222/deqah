import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface AdminChangePlanForOrgCommand {
  organizationId: string;
  newPlanId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class AdminChangePlanForOrgHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: AdminChangePlanForOrgCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Switches a foreign tenant's Subscription to a different Plan immediately (no billing cycle
    // boundary); the subscription row belongs to the target org, not the acting super-admin.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({
        where: { organizationId: cmd.organizationId },
        select: { id: true, planId: true, organizationId: true },
      });
      if (!sub) throw new NotFoundException('subscription_not_found');

      if (sub.planId === cmd.newPlanId) {
        throw new BadRequestException('plan_unchanged');
      }

      const newPlan = await tx.plan.findUnique({
        where: { id: cmd.newPlanId },
        select: { id: true, slug: true, isActive: true },
      });
      if (!newPlan) throw new NotFoundException('plan_not_found');
      if (!newPlan.isActive) {
        throw new BadRequestException('plan_inactive');
      }

      const previousPlan = await tx.plan.findUnique({
        where: { id: sub.planId },
        select: { slug: true },
      });

      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { planId: cmd.newPlanId },
        select: {
          id: true,
          organizationId: true,
          planId: true,
          status: true,
          currentPeriodEnd: true,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.BILLING_CHANGE_PLAN,
          organizationId: cmd.organizationId,
          reason: null,
          metadata: {
            subscriptionId: sub.id,
            previousPlanId: sub.planId,
            previousPlanSlug: previousPlan?.slug ?? null,
            newPlanId: cmd.newPlanId,
            newPlanSlug: newPlan.slug,
          },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });
  }
}
