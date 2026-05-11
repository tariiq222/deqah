import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class CreatePlanVersionHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: { planId: string }) {
    // SAFE: platform admin; $allTenants used to read/write platform-level Plan and PlanVersion models
    const plan = await this.prisma.$allTenants.plan.findFirst({
      where: { id: cmd.planId },
    });
    if (!plan) throw new NotFoundException(`Plan ${cmd.planId} not found`);

    const last = await this.prisma.$allTenants.planVersion.findFirst({
      where: { planId: cmd.planId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return this.prisma.$allTenants.planVersion.create({
      data: {
        planId: cmd.planId,
        version: (last?.version ?? 0) + 1,
        priceMonthly: plan.priceMonthly,
        priceAnnual: plan.priceAnnual,
        currency: plan.currency,
        limits: plan.limits ?? {},
      },
    });
  }
}
