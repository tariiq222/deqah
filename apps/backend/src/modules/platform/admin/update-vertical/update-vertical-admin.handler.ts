import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SuperAdminActionType, TemplateFamily } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface UpdateVerticalAdminCommand {
  verticalId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
  data: {
    nameAr?: string;
    nameEn?: string;
    templateFamily?: TemplateFamily;
    descriptionAr?: string;
    descriptionEn?: string;
    iconUrl?: string;
    isActive?: boolean;
    sortOrder?: number;
  };
}

@Injectable()
export class UpdateVerticalAdminHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: UpdateVerticalAdminCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Mutates a platform-wide Vertical row (nameAr/En, templateFamily, sortOrder, etc.);
    // Vertical is global with no organizationId and is blocked by RLS in a tenant context.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const existing = await tx.vertical.findUnique({ where: { id: cmd.verticalId } });
      if (!existing) throw new NotFoundException('vertical_not_found');

      const updateData: Prisma.VerticalUpdateInput = {};
      const fields = ['nameAr', 'nameEn', 'templateFamily', 'descriptionAr', 'descriptionEn', 'iconUrl', 'isActive', 'sortOrder'] as const;
      for (const field of fields) {
        const value = cmd.data[field];
        if (value !== undefined) (updateData as Record<string, unknown>)[field] = value;
      }

      const updated = await tx.vertical.update({ where: { id: cmd.verticalId }, data: updateData });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.VERTICAL_UPDATE,
          organizationId: null,
          reason: null,
          metadata: { verticalId: cmd.verticalId, changedFields: Object.keys(updateData) },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });
  }
}
