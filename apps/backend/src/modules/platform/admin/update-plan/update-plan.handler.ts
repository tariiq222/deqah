import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { parsePlanLimits } from '../../billing/plan-limits.zod';
import { EventBusService } from '../../../../infrastructure/events';
import {
  PLAN_UPDATED_EVENT,
  type PlanUpdatedPayload,
} from '../../billing/events/plan-updated.event';
import { LaunchFlags } from '../../billing/feature-flags/launch-flags';
import { CreatePlanVersionHandler } from '../../billing/plan-versions/create-plan-version.handler';

export interface UpdatePlanCommand {
  planId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
  data: {
    nameAr?: string;
    nameEn?: string;
    priceMonthly?: number;
    priceAnnual?: number;
    currency?: string;
    limits?: Record<string, unknown>;
    isActive?: boolean;
    isVisible?: boolean;
    sortOrder?: number;
  };
}

@Injectable()
export class UpdatePlanHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly flags: LaunchFlags,
    private readonly createPlanVersion: CreatePlanVersionHandler,
  ) {}

  async execute(cmd: UpdatePlanCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Mutates a platform-wide Plan row (pricing, limits, visibility) — Plan is global and has no
    // organizationId; a tenant-scoped transaction would fail the RLS policy.
    const result = await this.prisma.$allTenants.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id: cmd.planId } });
      if (!existing) throw new NotFoundException('plan_not_found');

      const updateData: Prisma.PlanUpdateInput = {};
      if (cmd.data.nameAr !== undefined) updateData.nameAr = cmd.data.nameAr;
      if (cmd.data.nameEn !== undefined) updateData.nameEn = cmd.data.nameEn;
      if (cmd.data.priceMonthly !== undefined) updateData.priceMonthly = new Prisma.Decimal(cmd.data.priceMonthly);
      if (cmd.data.priceAnnual !== undefined) updateData.priceAnnual = new Prisma.Decimal(cmd.data.priceAnnual);
      if (cmd.data.currency !== undefined) updateData.currency = cmd.data.currency;
      if (cmd.data.limits !== undefined) updateData.limits = parsePlanLimits(cmd.data.limits) as Prisma.InputJsonValue;
      if (cmd.data.isActive !== undefined) updateData.isActive = cmd.data.isActive;
      if (cmd.data.isVisible !== undefined) updateData.isVisible = cmd.data.isVisible;
      if (cmd.data.sortOrder !== undefined) updateData.sortOrder = cmd.data.sortOrder;

      const updated = await tx.plan.update({ where: { id: cmd.planId }, data: updateData });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.PLAN_UPDATE,
          organizationId: null,
          reason: null,
          metadata: { planId: cmd.planId, changedFields: Object.keys(updateData) },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });

    if (this.flags.planVersioningEnabled) {
      await this.createPlanVersion.execute({ planId: cmd.planId });
    }

    // Resolve orgs subscribed to this plan so the cache invalidator can target them.
    const affectedSubs = await this.prisma.$allTenants.subscription.findMany({
      where: { planId: cmd.planId },
      select: { organizationId: true },
    });
    const affectedOrganizationIds = affectedSubs.map((s) => s.organizationId);

    await this.eventBus
      .publish<PlanUpdatedPayload>(PLAN_UPDATED_EVENT, {
        eventId: `${PLAN_UPDATED_EVENT}:${cmd.planId}:${Date.now()}`,
        source: 'admin.update-plan',
        version: 1,
        occurredAt: new Date(),
        payload: { planId: cmd.planId, affectedOrganizationIds },
      })
      .catch(() => undefined);

    return result;
  }
}
