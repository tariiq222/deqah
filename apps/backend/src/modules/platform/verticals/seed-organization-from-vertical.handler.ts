import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';

@Injectable()
export class SeedOrganizationFromVerticalHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: { organizationId: string; verticalSlug: string }) {
    const vertical = await this.prisma.vertical.findFirst({
      where: { slug: cmd.verticalSlug, isActive: true },
      include: {
        seedDepartments: true,
        seedServiceCategories: true,
      },
    });
    if (!vertical) {
      throw new NotFoundException(`Vertical '${cmd.verticalSlug}' not found`);
    }

    // Idempotency: skip if the org already has departments
    const existingDepartments = await this.prisma.department.count({
      where: { organizationId: cmd.organizationId },
    });
    if (existingDepartments > 0) {
      return { skipped: true, reason: 'already-seeded' };
    }

    // bypassRls: true — called during tenant bootstrap (seeding vertical data into
    // an org that was just created). CLS tenant context is not established at this
    // point; the organizationId is supplied explicitly on every write below.
    return this.rlsTx.withTransaction(async (tx) => {
      for (const seed of vertical.seedDepartments) {
        await tx.department.create({
          data: {
            organizationId: cmd.organizationId,
            nameAr: seed.nameAr,
            nameEn: seed.nameEn ?? undefined,
            sortOrder: seed.sortOrder,
          },
        });
      }
      for (const seed of vertical.seedServiceCategories) {
        await tx.serviceCategory.create({
          data: {
            organizationId: cmd.organizationId,
            nameAr: seed.nameAr,
            nameEn: seed.nameEn ?? undefined,
            sortOrder: seed.sortOrder,
          },
        });
      }
      await tx.organization.update({
        where: { id: cmd.organizationId },
        data: { verticalId: vertical.id },
      });
      return {
        verticalId: vertical.id,
        seededDepartments: vertical.seedDepartments.length,
        seededCategories: vertical.seedServiceCategories.length,
      };
    }, { bypassRls: true });
  }
}
