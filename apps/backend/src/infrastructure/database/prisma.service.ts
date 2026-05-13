import { ForbiddenException, Injectable, Logger, Optional, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import {
  buildTenantScopingExtension,
  TenantScopedModelRegistry,
} from '../../common/tenant/tenant-scoping.extension';
import {
  REQUEST_TX_CLS_KEY,
  SUPER_ADMIN_CONTEXT_CLS_KEY,
  TenantEnforcementMode,
} from '../../common/tenant/tenant.constants';

/**
 * Populated cluster-by-cluster as each cluster gains `organizationId` columns.
 * Each model listed here is auto-scoped by the tenant extension: every
 * `findFirst/findUnique/findMany/count/updateMany/deleteMany/etc.` gets
 * `organizationId = ctx.organizationId` injected into its where clause.
 */
const SCOPED_MODELS: TenantScopedModelRegistry = new Set<string>([
  // SaaS-02a — identity cluster.
  'RefreshToken',
  'CustomRole',
  'Permission',
  // SaaS-02b — people cluster + ClientRefreshToken.
  'Client',
  'ClientRefreshToken',
  'PasswordHistory',
  'Employee',
  'EmployeeBranch',
  'EmployeeService',
  'EmployeeAvailability',
  'EmployeeAvailabilityException',
  'EmployeeBreak',
  // SaaS-02c — org-config + org-experience cluster.
  'Branch',
  'Department',
  'ServiceCategory',
  'Service',
  'ServiceBookingConfig',
  'ServiceDurationOption',
  'EmployeeServiceOption',
  'BusinessHour',
  'Holiday',
  'BrandingConfig',
  'IntakeForm',
  'IntakeField',
  'Rating',
  'OrganizationSettings',
  // 02d — bookings
  'Booking', 'BookingStatusLog', 'WaitlistEntry',
  'GroupSession', 'GroupEnrollment', 'GroupSessionWaitlist',
  'BookingSettings',
  // 02e — finance
  'Invoice',
  'Payment',
  'Coupon',
  'CouponRedemption',
  'RefundRequest',
  // P0 2026-04-27 — per-tenant Moyasar credentials
  'OrganizationPaymentConfig',
  // 02f — comms + ai
  'EmailTemplate',
  'Notification',
  'ChatConversation',
  'CommsChatMessage',
  'ChatSession',
  'ChatMessage',
  'ContactMessage',
  'ChatbotConfig',
  'FcmToken',
  // Bug B5 (2026-05-03) — comms tenant models that were silently unscoped.
  // OrganizationEmailConfig holds per-tenant SMTP credentials (encrypted but
  // still tenant-secret); a `findFirst()` without an explicit where would
  // otherwise return any tenant's config.
  'OrganizationEmailConfig',
  // NotificationDeliveryLog is per-tenant audit data — must not bleed across orgs.
  'NotificationDeliveryLog',
  // 02g — AI + media + ops + platform + content
  'KnowledgeDocument',
  'DocumentChunk',
  'File',
  'ActivityLog',
  'Report',
  'ProblemReport',
  'Integration',
  'SiteSetting',
  // 02g-sms — per-tenant SMS provider
  'OrganizationSmsConfig',
  'SmsDelivery',
  // 02g — platform cluster
  'Membership',
  // 2026-04-26 — OTP scoping fix
  'OtpCode',
  'UsedOtpSession',
  // 2026-04-28 — mobile OTP-only auth
  'EmailVerificationToken',
  // 04 — billing (Plan and SubscriptionInvoice are deliberately PLATFORM-level
  // and NOT scoped — they describe Deqah's catalog / receivables respectively).
  'Subscription',
  'UsageRecord',
  'SavedCard',
  'DunningLog',
  // Platform models with organizationId (admin-level, but scoped for defense-in-depth)
  // NOTE: PasswordResetToken deliberately NOT scoped — it has no organizationId column.
  'BillingCredit',
  'Invitation',
  // ImpersonationSession deliberately NOT scoped — list-impersonation-sessions handler
  // must read across all organizations via $allTenants bypass.
  // WebhookEvent is platform-level (Deqah's own webhook dedup), intentionally unscoped
  // Phase 5 — materialized quota counters (tenant-scoped for RLS safety)
  'UsageCounter',
  // Bug B5 (2026-05-03) — per-tenant invoice numbering counter. The schema
  // comment used to claim "intentionally not scoped" because writes are
  // server-side, but a Prisma extension scope is the only thing preventing
  // a future bug from selecting another tenant's `lastSequence` and
  // colliding invoice numbers across orgs.
  'OrganizationInvoiceCounter',
  // Phase 2 / Bug B11 — refund→usage decrement idempotency log
  'RefundUsageRevertLog',
  // Zoho Invoice integration — link/mirror tables (organizationId scoped).
  // ZohoWebhookEvent is also scoped because each Zoho webhook delivery is
  // resolved to a tenant before signature verification, and we never want
  // a query to bleed events across orgs.
  'ZohoContactLink',
  'ZohoInvoiceLink',
  'ZohoCreditNoteLink',
  'ZohoWebhookEvent',
  'IntegrationAuditLog',
]);

/**
 * Single PrismaClient instance shared across all Bounded Contexts.
 *
 * Why a Proxy instead of `Object.assign(this, extended)`?
 * - In Prisma 7, `$extends` returns a different runtime client whose model
 *   accessors use internal proxy traps. Copying those traps onto `this` with
 *   Object.assign silently drops fields and produces subtle bugs at query time.
 * - A Proxy preserves the full extended client (including its traps) while
 *   keeping `PrismaService` a `PrismaClient` subclass for DI and types.
 * - Callers that read `prisma.user.findMany(...)` transparently hit the
 *   extended client's hooks, which is exactly what we want.
 *
 * With `SCOPED_MODELS` empty in Plan 01 the hook is a per-query `Set.has()`
 * lookup that returns false and short-circuits — no behavior change.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly basePrisma: PrismaClient;
  private readonly extended: PrismaClient;

  constructor(
    // `@Optional()` lets isolated test modules instantiate PrismaService
    // without wiring ConfigModule/TenantModule. In prod both are global and
    // always present — the optionals are only for narrow unit-test fixtures.
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly cls?: ClsService,
    @Optional() private readonly tenantCtx?: TenantContextService,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: 25,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }),
    });
    this.basePrisma = this as unknown as PrismaClient;
    const mode = (this.config?.get<TenantEnforcementMode>('TENANT_ENFORCEMENT', 'strict') ??
      'strict') as TenantEnforcementMode;

    // When DI is not available (unit tests using `new PrismaService()`), fall
    // back to the base client unchanged — the extension would have nothing to
    // scope anyway because there is no tenant context. Prod always has DI.
    if (mode === 'off' || !this.tenantCtx) {
      this.extended = this.basePrisma;
      return;
    }

    // `$extends`'s input type is generated from the user's schema and does not
    // cleanly accept a statically-typed factory extension; cast through unknown.
    const ext = buildTenantScopingExtension(this.tenantCtx, mode, SCOPED_MODELS);
    this.extended = this.$extends(ext as unknown as Parameters<typeof this.$extends>[0]) as unknown as PrismaClient;

    // Proxy reads for model accessors and $-methods go to the extended client;
    // lifecycle + internal fields stay on the base class.
    const self = this;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (
          prop === 'onModuleInit' ||
          prop === 'onModuleDestroy' ||
          prop === 'logger' ||
          prop === 'config' ||
          prop === 'cls' ||
          prop === 'tenantCtx' ||
          prop === 'basePrisma' ||
          prop === 'extended' ||
          prop === '$allTenants' ||
          prop === '__bypassClient' ||
          prop === '$connect' ||
          prop === '$disconnect'
        ) {
          return Reflect.get(target, prop, receiver);
        }
        // CLS-pinned transaction routing: when TenantGucInterceptor wrapped this
        // request in a transaction, route model accessors through the pinned tx
        // so every query reuses the same connection (and sees app.current_org_id).
        // Skip $-prefixed methods and well-known internal symbols -- those are the
        // orchestration API of PrismaClient itself, not model accessors.
        if (
          typeof prop === 'string' &&
          !prop.startsWith('$') &&
          !prop.startsWith('_') &&
          prop !== 'then' &&
          prop !== 'catch' &&
          prop !== 'finally' &&
          prop !== 'constructor'
        ) {
          const tx = self.cls?.get<Prisma.TransactionClient | undefined>(
            REQUEST_TX_CLS_KEY,
          );
          if (tx) {
            const modelOnTx = Reflect.get(tx as object, prop);
            if (modelOnTx !== undefined) return modelOnTx;
          }
        }

        const fromExtended = Reflect.get(self.extended as object, prop);
        if (typeof fromExtended === 'function') {
          return (fromExtended as (...args: unknown[]) => unknown).bind(self.extended);
        }
        return fromExtended ?? Reflect.get(target, prop, receiver);
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log(
      `Prisma connected (tenant mode = ${this.config?.get('TENANT_ENFORCEMENT', 'strict') ?? 'strict'})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  get $allTenants(): PrismaClient {
    if (this.cls?.get<boolean | undefined>(SUPER_ADMIN_CONTEXT_CLS_KEY) !== true) {
      throw new ForbiddenException('super_admin_context_required');
    }
    return this.basePrisma;
  }

  /**
   * Internal escape hatch for `RlsHelper.runWithoutTenant`. Returns the
   * UNEXTENDED base PrismaClient — no tenant scoping, no RLS bypass on
   * its own. Callers must wrap in a transaction that sets
   * app.bypass_rls=on before issuing queries. Do not use directly;
   * always go through RlsHelper.
   */
  get __bypassClient(): PrismaClient {
    return this.basePrisma;
  }
}
