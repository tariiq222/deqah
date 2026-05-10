import { ConflictException, Injectable } from '@nestjs/common';
import { SuperAdminActionType, TemplateFamily } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface CreateVerticalAdminCommand {
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
  data: {
    slug: string;
    nameAr: string;
    nameEn: string;
    templateFamily: TemplateFamily;
    descriptionAr?: string;
    descriptionEn?: string;
    iconUrl?: string;
    isActive?: boolean;
    sortOrder?: number;
  };
}

@Injectable()
export class CreateVerticalAdminHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: CreateVerticalAdminCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Creates a platform-wide Vertical row (global terminology/seed config, no organizationId);
    // RLS would block the insert if run inside any tenant context.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const existing = await tx.vertical.findUnique({ where: { slug: cmd.data.slug } });
      if (existing) throw new ConflictException('vertical_slug_already_exists');

      const vertical = await tx.vertical.create({
        data: {
          slug: cmd.data.slug,
          nameAr: cmd.data.nameAr,
          nameEn: cmd.data.nameEn,
          templateFamily: cmd.data.templateFamily,
          descriptionAr: cmd.data.descriptionAr,
          descriptionEn: cmd.data.descriptionEn,
          iconUrl: cmd.data.iconUrl,
          isActive: cmd.data.isActive ?? true,
          sortOrder: cmd.data.sortOrder ?? 0,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.VERTICAL_CREATE,
          organizationId: null,
          reason: null,
          metadata: { verticalId: vertical.id, slug: vertical.slug },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return vertical;
    });
  }
}
