import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingCycle,
  Prisma,
  SubscriptionStatus,
  SuperAdminActionType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { PlatformMailerService } from '../../../../infrastructure/mail';
import { OwnerProvisioningService } from '../../../identity/owner-provisioning/owner-provisioning.service';

export interface CreateTenantCommand {
  slug: string;
  nameAr: string;
  nameEn?: string;
  ownerUserId?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  ownerPassword?: string;
  verticalSlug?: string;
  planId?: string;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  trialDays?: number;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

const DAY_MS = 86_400_000;

@Injectable()
export class CreateTenantHandler {
  private readonly logger = new Logger(CreateTenantHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerProvisioning: OwnerProvisioningService,
    private readonly mailer: PlatformMailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: CreateTenantCommand) {
    if (!cmd.ownerUserId && !cmd.ownerEmail) {
      throw new BadRequestException('ownerUserId_or_ownerEmail_required');
    }

    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Creates a brand-new Organization + initial OWNER Membership + BrandingConfig +
    // OrganizationSettings + optional Subscription; no tenant context exists yet for the
    // new org, so a bypass is mandatory.
    const txResult = await this.prisma.$allTenants.$transaction(async (tx) => {
      const existing = await tx.organization.findUnique({
        where: { slug: cmd.slug },
        select: { id: true },
      });
      if (existing) throw new ConflictException('organization_slug_already_exists');

      const provisionResult = await this.ownerProvisioning.provision({
        ownerUserId: cmd.ownerUserId,
        name: cmd.ownerName,
        email: cmd.ownerEmail,
        phone: cmd.ownerPhone,
        password: cmd.ownerPassword,
        tx,
      });

      const vertical = cmd.verticalSlug
        ? await tx.vertical.findFirst({
            where: { slug: cmd.verticalSlug, isActive: true },
            select: {
              id: true,
              slug: true,
              seedDepartments: {
                select: { nameAr: true, nameEn: true, sortOrder: true },
              },
              seedServiceCategories: {
                select: { nameAr: true, nameEn: true, sortOrder: true },
              },
            },
          })
        : null;
      if (cmd.verticalSlug && !vertical) throw new NotFoundException('vertical_not_found');

      const plan = cmd.planId
        ? await tx.plan.findUnique({
            where: { id: cmd.planId },
            select: { id: true, slug: true, isActive: true },
          })
        : null;
      if (cmd.planId && !plan) throw new NotFoundException('plan_not_found');
      if (plan && !plan.isActive) throw new ConflictException('plan_inactive');

      const now = new Date();
      const trialDays = cmd.trialDays ?? (plan ? 14 : 0);
      const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * DAY_MS) : null;
      const billingCycle = (cmd.billingCycle ?? 'MONTHLY') as BillingCycle;

      const organization = await tx.organization.create({
        data: {
          slug: cmd.slug,
          nameAr: cmd.nameAr,
          nameEn: cmd.nameEn,
          status: plan ? 'TRIALING' : 'ACTIVE',
          verticalId: vertical?.id,
          trialEndsAt,
          onboardingCompletedAt: now,
        },
        select: {
          id: true,
          slug: true,
          nameAr: true,
          nameEn: true,
          status: true,
          verticalId: true,
          trialEndsAt: true,
          onboardingCompletedAt: true,
        },
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: provisionResult.userId,
          role: 'OWNER',
          isActive: true,
          acceptedAt: now,
        },
      });

      await tx.brandingConfig.create({
        data: {
          organizationId: organization.id,
          organizationNameAr: cmd.nameAr,
          organizationNameEn: cmd.nameEn,
        },
      });

      await tx.organizationSettings.create({
        data: {
          organizationId: organization.id,
          companyNameAr: cmd.nameAr,
          companyNameEn: cmd.nameEn,
        },
      });

      for (const seed of vertical?.seedDepartments ?? []) {
        await tx.department.create({
          data: {
            organizationId: organization.id,
            nameAr: seed.nameAr,
            nameEn: seed.nameEn ?? undefined,
            sortOrder: seed.sortOrder,
          },
        });
      }

      for (const seed of vertical?.seedServiceCategories ?? []) {
        await tx.serviceCategory.create({
          data: {
            organizationId: organization.id,
            nameAr: seed.nameAr,
            nameEn: seed.nameEn ?? undefined,
            sortOrder: seed.sortOrder,
          },
        });
      }

      let subscriptionId: string | null = null;
      if (plan) {
        const periodEnd =
          billingCycle === 'ANNUAL'
            ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
            : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        const subscription = await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: plan.id,
            status: SubscriptionStatus.TRIALING,
            billingCycle,
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          select: { id: true },
        });
        subscriptionId = subscription.id;
      }

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.TENANT_CREATE,
          organizationId: organization.id,
          reason: null,
          metadata: {
            slug: cmd.slug,
            ownerUserId: provisionResult.userId,
            ownerCreatedNew: provisionResult.isNewUser,
            passwordWasGenerated: Boolean(provisionResult.generatedPassword),
            verticalSlug: vertical?.slug ?? null,
            planId: plan?.id ?? null,
            planSlug: plan?.slug ?? null,
            subscriptionId,
          } satisfies Prisma.InputJsonValue,
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return { organization, provisionResult };
    });

    // Fire-and-forget welcome email for newly created owners
    const { organization, provisionResult } = txResult;
    if (provisionResult.isNewUser && cmd.ownerEmail) {
      const dashboardUrl = this.config.get<string>(
        'PLATFORM_DASHBOARD_URL',
        'https://app.webvue.pro/dashboard',
      );
      this.mailer
        .sendTenantWelcome(cmd.ownerEmail, {
          ownerName: cmd.ownerName ?? cmd.ownerEmail,
          orgName: cmd.nameAr,
          dashboardUrl,
          generatedPassword: provisionResult.generatedPassword,
        })
        .catch((err: unknown) =>
          this.logger.error('failed to send tenant welcome email', err),
        );
    }

    return organization;
  }
}
