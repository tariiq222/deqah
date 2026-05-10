import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { parsePlanLimits } from '../../billing/plan-limits.zod';
import { LaunchFlags } from '../../billing/feature-flags/launch-flags';
import { CreatePlanVersionHandler } from '../../billing/plan-versions/create-plan-version.handler';

export interface CreatePlanCommand {
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
  data: {
    slug: string;
    nameAr: string;
    nameEn: string;
    priceMonthly: number;
    priceAnnual: number;
    currency?: string;
    limits: Record<string, unknown>;
    isActive?: boolean;
    sortOrder?: number;
  };
}

@Injectable()
export class CreatePlanHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: LaunchFlags,
    private readonly createPlanVersion: CreatePlanVersionHandler,
  ) {}

  async execute(cmd: CreatePlanCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Creates a platform-wide Plan row that is not scoped to any Organization;
    // RLS would block this write if run inside a tenant context.
    const plan = await this.prisma.$allTenants.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { slug: cmd.data.slug } });
      if (existing) throw new ConflictException('plan_slug_already_exists');

      const created = await tx.plan.create({
        data: {
          slug: cmd.data.slug,
          nameAr: cmd.data.nameAr,
          nameEn: cmd.data.nameEn,
          priceMonthly: new Prisma.Decimal(cmd.data.priceMonthly),
          priceAnnual: new Prisma.Decimal(cmd.data.priceAnnual),
          currency: cmd.data.currency ?? 'SAR',
          limits: parsePlanLimits(cmd.data.limits) as Prisma.InputJsonValue,
          isActive: cmd.data.isActive ?? true,
          sortOrder: cmd.data.sortOrder ?? 0,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.PLAN_CREATE,
          organizationId: null,
          reason: null,
          metadata: { planId: created.id, slug: created.slug },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return created;
    });

    if (this.flags.planVersioningEnabled) {
      await this.createPlanVersion.execute({ planId: plan.id });
    }

    return plan;
  }
}
