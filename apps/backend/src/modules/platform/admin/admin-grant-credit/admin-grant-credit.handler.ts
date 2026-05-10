import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface AdminGrantCreditCommand {
  organizationId: string;
  amount: number;
  currency: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class AdminGrantCreditHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: AdminGrantCreditCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Grants a BillingCredit to a foreign tenant's Organization; the credit row is
    // scoped to the target org, but the write must bypass the caller's RLS context.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: cmd.organizationId },
        select: { id: true },
      });
      if (!org) throw new NotFoundException('organization_not_found');

      const credit = await tx.billingCredit.create({
        data: {
          organizationId: cmd.organizationId,
          amount: new Prisma.Decimal(cmd.amount),
          currency: cmd.currency,
          reason: null,
          grantedByUserId: cmd.superAdminUserId,
        },
        select: {
          id: true,
          organizationId: true,
          amount: true,
          currency: true,
          reason: true,
          grantedByUserId: true,
          grantedAt: true,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.BILLING_GRANT_CREDIT,
          organizationId: cmd.organizationId,
          reason: null,
          metadata: {
            creditId: credit.id,
            amount: credit.amount.toString(),
            currency: credit.currency,
          },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return credit;
    });
  }
}
