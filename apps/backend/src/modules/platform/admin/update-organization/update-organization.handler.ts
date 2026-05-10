import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface UpdateOrganizationCommand {
  organizationId: string;
  nameAr?: string;
  nameEn?: string | null;
  verticalSlug?: string | null;
  trialEndsAt?: Date | null;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class UpdateOrganizationHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: UpdateOrganizationCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Updates nameAr/nameEn/verticalSlug/trialEndsAt on a foreign Organization row by id;
    // the super-admin operates outside any tenant context.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const current = await tx.organization.findUnique({
        where: { id: cmd.organizationId },
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          verticalId: true,
          trialEndsAt: true,
        },
      });
      if (!current) throw new NotFoundException('organization_not_found');

      let nextVerticalId: string | null | undefined;
      let nextVerticalSlug: string | null | undefined;
      if (cmd.verticalSlug !== undefined) {
        if (cmd.verticalSlug === null) {
          nextVerticalId = null;
          nextVerticalSlug = null;
        } else {
          const vertical = await tx.vertical.findFirst({
            where: { slug: cmd.verticalSlug, isActive: true },
            select: { id: true, slug: true },
          });
          if (!vertical) throw new NotFoundException('vertical_not_found');
          nextVerticalId = vertical.id;
          nextVerticalSlug = vertical.slug;
        }
      }

      const data: Prisma.OrganizationUpdateInput = {};
      if (cmd.nameAr !== undefined) data.nameAr = cmd.nameAr;
      if (cmd.nameEn !== undefined) data.nameEn = cmd.nameEn;
      if (nextVerticalId !== undefined) data.vertical = nextVerticalId
        ? { connect: { id: nextVerticalId } }
        : { disconnect: true };
      if (cmd.trialEndsAt !== undefined) data.trialEndsAt = cmd.trialEndsAt;

      const updated = await tx.organization.update({
        where: { id: cmd.organizationId },
        data,
        select: {
          id: true,
          slug: true,
          nameAr: true,
          nameEn: true,
          verticalId: true,
          trialEndsAt: true,
          status: true,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.TENANT_UPDATE,
          organizationId: cmd.organizationId,
          reason: null,
          metadata: {
            previous: current,
            next: {
              nameAr: updated.nameAr,
              nameEn: updated.nameEn,
              verticalId: updated.verticalId,
              verticalSlug: nextVerticalSlug,
              trialEndsAt: updated.trialEndsAt,
            },
          } satisfies Prisma.InputJsonValue,
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });
  }
}
