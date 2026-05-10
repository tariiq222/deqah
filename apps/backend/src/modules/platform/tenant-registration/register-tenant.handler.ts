import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PasswordService } from '../../identity/shared/password.service';
import { TokenService } from '../../identity/shared/token.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { SubscriptionCacheService } from '../billing/subscription-cache.service';
import { PlatformMailerService } from '../../../infrastructure/mail';
import { OwnerProvisioningService } from '../../identity/owner-provisioning/owner-provisioning.service';
import { generateSubdomainSafeSlug } from '../../../common/tenant/slug-generator.util';
import type { RegisterTenantDto } from './register-tenant.dto';

function isPrismaUniqueOn(err: unknown, target: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; meta?: { target?: string | string[] } };
  if (e.code !== 'P2002') return false;
  const t = e.meta?.target;
  if (!t) return false;
  return Array.isArray(t) ? t.some((x) => x.includes(target)) : t.includes(target);
}

const DAY_MS = 86_400_000;

@Injectable()
export class RegisterTenantHandler {
  private readonly logger = new Logger(RegisterTenantHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly tenant: TenantContextService,
    private readonly cache: SubscriptionCacheService,
    private readonly mailer: PlatformMailerService,
    private readonly ownerProvisioning: OwnerProvisioningService,
  ) {}

  async execute(dto: RegisterTenantDto) {
    const planSlug = this.config.get<string>('PLATFORM_DEFAULT_PLAN_SLUG', 'BASIC');
    const plan = await this.prisma.plan.findFirst({ where: { slug: planSlug, isActive: true } });
    if (!plan) throw new NotFoundException(`Default plan '${planSlug}' not found — run the seed script`);

    // Self-serve must NOT auto-link existing users — that is admin-only behaviour.
    // Pre-check before entering the transaction so we surface a clean 409.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const trialDays = this.config.get<number>('SAAS_TRIAL_DAYS', 14);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * DAY_MS);
    const baseSlug = generateSubdomainSafeSlug(dto.businessNameAr);

    // Resolve billing cycle period
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    // Resolve the vertical to seed: prefer the DTO field; fall back to the first
    // active vertical in the DB. Failure to find a vertical is non-fatal — we
    // log a warning and proceed without seeding.
    const vertical = await this.resolveVertical(dto.verticalSlug);

    // Try baseSlug first; on collision append a deterministic numeric suffix
    // (attempt 2 → "-2", attempt 3 → "-3", …). Retry up to 50 times before
    // giving up. Email collisions surface as the proper 409.
    const maxAttempts = 50;
    let attempt = 0;
    let result: { orgId: string; userId: string; membershipId: string; subscriptionId: string } | undefined;

    while (attempt < maxAttempts) {
      attempt += 1;
      const slug = attempt === 1
        ? baseSlug
        : `${baseSlug.slice(0, Math.max(1, 30 - String(attempt).length - 1))}-${attempt}`;
      try {
        result = await this.prisma.$transaction(async (tx) => {
          const org = await tx.organization.create({
            data: {
              slug,
              nameAr: dto.businessNameAr,
              nameEn: dto.businessNameEn ?? null,
              status: 'TRIALING',
              trialEndsAt,
              verticalId: vertical?.id ?? null,
            },
          });

          const ownerResult = await this.ownerProvisioning.provision({
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            password: dto.password,
            tx,
          });

          const membership = await tx.membership.create({
            data: {
              userId: ownerResult.userId,
              organizationId: org.id,
              role: 'OWNER',
              isActive: true,
              acceptedAt: new Date(),
            },
          });

          await tx.brandingConfig.create({
            data: {
              organizationId: org.id,
              organizationNameAr: dto.businessNameAr,
              organizationNameEn: dto.businessNameEn ?? null,
            },
          });

          await tx.organizationSettings.create({
            data: {
              organizationId: org.id,
              timezone: 'Asia/Riyadh',
              vatRate: 0.15,
            },
          });

          // Create subscription inside the same tx so org + subscription are
          // atomic — no orphan org without a subscription on failure.
          const sub = await tx.subscription.create({
            data: {
              organizationId: org.id,
              planId: plan.id,
              status: 'TRIALING',
              billingCycle: 'MONTHLY',
              trialStartedAt: now,
              trialEndsAt,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              moyasarCardTokenRef: null,
            },
          });

          // Seed vertical departments and service categories if a vertical was resolved.
          if (vertical) {
            for (const seed of vertical.seedDepartments) {
              await tx.department.create({
                data: {
                  organizationId: org.id,
                  nameAr: seed.nameAr,
                  nameEn: seed.nameEn ?? undefined,
                  sortOrder: seed.sortOrder,
                },
              });
            }
            for (const seed of vertical.seedServiceCategories) {
              await tx.serviceCategory.create({
                data: {
                  organizationId: org.id,
                  nameAr: seed.nameAr,
                  nameEn: seed.nameEn ?? undefined,
                  sortOrder: seed.sortOrder,
                },
              });
            }
          }

          return { orgId: org.id, userId: ownerResult.userId, membershipId: membership.id, subscriptionId: sub.id };
        });
        break;
      } catch (err: unknown) {
        if (isPrismaUniqueOn(err, 'email')) {
          throw new ConflictException('Email already registered');
        }
        if (isPrismaUniqueOn(err, 'slug') && attempt < maxAttempts) {
          continue;
        }
        throw err;
      }
    }

    if (!result) {
      throw new ConflictException('Could not allocate a unique organization slug — please retry');
    }

    // Set CLS tenant context for any post-tx operations that require it.
    this.tenant.set({
      organizationId: result.orgId,
      membershipId: result.membershipId,
      id: result.userId,
      role: 'ADMIN',
      isSuperAdmin: false,
    });

    this.cache.invalidate(result.orgId);

    const userForTokens = await this.prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      include: { customRole: { include: { permissions: true } } },
    });

    const tokenPair = await this.tokens.issueTokenPair(userForTokens, {
      organizationId: result.orgId,
      membershipId: result.membershipId,
      isSuperAdmin: false,
    });

    const dashboardUrl = this.config.get<string>(
      'PLATFORM_DASHBOARD_URL',
      'https://app.webvue.pro/dashboard',
    );
    await this.mailer.sendTenantWelcome(dto.email, {
      ownerName: dto.name,
      orgName: dto.businessNameAr,
      dashboardUrl,
    });

    return { ...tokenPair, userId: result.userId };
  }

  /**
   * Resolve which vertical to seed for a new self-serve tenant.
   *
   * Priority:
   * 1. If dto.verticalSlug is provided, look it up (throws if not found).
   * 2. Otherwise, use the first active vertical (by createdAt) as the platform default.
   * 3. If the DB has no verticals at all, log a warning and return null — signup
   *    proceeds without seeding (non-fatal).
   */
  private async resolveVertical(verticalSlug?: string) {
    if (verticalSlug) {
      const v = await this.prisma.vertical.findFirst({
        where: { slug: verticalSlug, isActive: true },
        include: {
          seedDepartments: { select: { nameAr: true, nameEn: true, sortOrder: true } },
          seedServiceCategories: { select: { nameAr: true, nameEn: true, sortOrder: true } },
        },
      });
      if (!v) throw new NotFoundException(`Vertical '${verticalSlug}' not found or inactive`);
      return v;
    }

    // Fall back to the first active vertical ordered by createdAt
    const defaultVertical = await this.prisma.vertical.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        seedDepartments: { select: { nameAr: true, nameEn: true, sortOrder: true } },
        seedServiceCategories: { select: { nameAr: true, nameEn: true, sortOrder: true } },
      },
    });

    if (!defaultVertical) {
      this.logger.warn('No active vertical found in DB — skipping vertical seed for new tenant');
      return null;
    }

    return defaultVertical;
  }
}
