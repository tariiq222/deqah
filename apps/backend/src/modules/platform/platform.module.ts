import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../../infrastructure/mail';
import { MessagingModule } from '../../infrastructure/messaging.module';
import { DashboardPlatformController } from '../../api/dashboard/platform.controller';
import { DashboardVerticalsController } from '../../api/dashboard/verticals.controller';
import { AdminOrganizationsController } from '../../api/admin/organizations.controller';
import { AdminUsersController } from '../../api/admin/users.controller';
import { AdminPlansController } from '../../api/admin/plans.controller';
import { AdminVerticalsController } from '../../api/admin/verticals.controller';
import { AdminMetricsController } from '../../api/admin/metrics.controller';
import { AdminAuditLogController } from '../../api/admin/audit-log.controller';
import { AdminImpersonationController } from '../../api/admin/impersonation.controller';
import { SuperAdminContextInterceptor } from '../../common/interceptors';
import { AdminHostGuard, OwnerOnlyGuard, SuperAdminGuard } from '../../common/guards';
import { DatabaseModule } from '../../infrastructure/database';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { TenantModule } from '../../common/tenant';
import { PasswordService } from '../identity/shared/password.service';
import { VerticalsModule } from './verticals/verticals.module';
import { CreateProblemReportHandler } from './problem-reports/create-problem-report.handler';
import { ListProblemReportsHandler } from './problem-reports/list-problem-reports.handler';
import { UpdateProblemReportStatusHandler } from './problem-reports/update-problem-report-status.handler';
import { UpsertIntegrationHandler } from './integrations/upsert-integration.handler';
import { ListIntegrationsHandler } from './integrations/list-integrations.handler';
import { ListOrganizationsHandler } from './admin/list-organizations/list-organizations.handler';
import { GetOrganizationHandler } from './admin/get-organization/get-organization.handler';
import { CreateTenantHandler } from './admin/create-tenant/create-tenant.handler';
import { UpdateOrganizationHandler } from './admin/update-organization/update-organization.handler';
import { ArchiveOrganizationHandler } from './admin/archive-organization/archive-organization.handler';
import { SuspendOrganizationHandler } from './admin/suspend-organization/suspend-organization.handler';
import { ReinstateOrganizationHandler } from './admin/reinstate-organization/reinstate-organization.handler';
import { SearchUsersHandler } from './admin/search-users/search-users.handler';
import { ResetUserPasswordHandler } from './admin/reset-user-password/reset-user-password.handler';
import { ListPlansAdminHandler } from './admin/list-plans/list-plans-admin.handler';
import { CreatePlanHandler } from './admin/create-plan/create-plan.handler';
import { UpdatePlanHandler } from './admin/update-plan/update-plan.handler';
import { DeletePlanHandler } from './admin/delete-plan/delete-plan.handler';
import { ListVerticalsAdminHandler } from './admin/list-verticals/list-verticals-admin.handler';
import { CreateVerticalAdminHandler } from './admin/create-vertical/create-vertical-admin.handler';
import { UpdateVerticalAdminHandler } from './admin/update-vertical/update-vertical-admin.handler';
import { DeleteVerticalAdminHandler } from './admin/delete-vertical/delete-vertical-admin.handler';
import { GetPlatformMetricsHandler } from './admin/get-platform-metrics/get-platform-metrics.handler';
import { ListAuditLogHandler } from './admin/list-audit-log/list-audit-log.handler';
import { LogPlatformSettingUpdateHandler } from './admin/log-platform-setting-update/log-platform-setting-update.handler';
import { StartImpersonationHandler } from './admin/start-impersonation/start-impersonation.handler';
import { EndImpersonationHandler } from './admin/end-impersonation/end-impersonation.handler';
import { ListImpersonationSessionsHandler } from './admin/list-impersonation-sessions/list-impersonation-sessions.handler';
import { ExpireImpersonationSessionsCron } from './admin/expire-impersonation-sessions/expire-impersonation-sessions.cron';
import { OrgsWithoutOwnerCron } from './admin/orgs-without-owner/orgs-without-owner.cron';
import { ListSubscriptionsHandler } from './admin/list-subscriptions/list-subscriptions.handler';
import { GetOrgBillingHandler } from './admin/get-org-billing/get-org-billing.handler';
import { ListSubscriptionInvoicesHandler } from './admin/list-subscription-invoices/list-subscription-invoices.handler';
import { ListZohoSaasInvoicesHandler } from './admin/list-zoho-saas-invoices/list-zoho-saas-invoices.handler';
import { GetBillingMetricsHandler } from './admin/get-billing-metrics/get-billing-metrics.handler';
import { AdminWaiveInvoiceHandler } from './admin/admin-waive-invoice/admin-waive-invoice.handler';
import { AdminGrantCreditHandler } from './admin/admin-grant-credit/admin-grant-credit.handler';
import { AdminChangePlanForOrgHandler } from './admin/admin-change-plan-for-org/admin-change-plan-for-org.handler';
import { AdminRefundInvoiceHandler } from './admin/admin-refund-invoice/admin-refund-invoice.handler';
import { AdminForceChargeHandler } from './admin/admin-force-charge/admin-force-charge.handler';
import { AdminCancelScheduledHandler } from './admin/admin-cancel-scheduled/admin-cancel-scheduled.handler';
import { AdminBillingController } from '../../api/admin/billing.controller';
import { AdminNotificationsController } from '../../api/admin/notifications.controller';
import { ListNotificationDeliveryLogHandler } from './admin/list-notification-delivery-log/list-notification-delivery-log.handler';
import { FinanceModule } from '../finance/finance.module';
import { RegisterTenantHandler } from './tenant-registration/register-tenant.handler';
import { IdentityModule } from '../identity/identity.module';
import { BillingModule } from './billing/billing.module';
import { PlatformSettingsModule } from './settings/platform-settings.module';
import { PlatformEmailModule } from './email/platform-email.module';
import { PlatformEmailController } from '../../api/admin/platform-email.controller';
import { NotificationsConfigModule } from './notifications-config/notifications-config.module';
import { AdminNotificationsConfigController } from '../../api/admin/notifications-config.controller';
import { BillingSettingsController } from '../../api/admin/billing-settings.controller';
import { BrandingSettingsController } from '../../api/admin/branding-settings.controller';
import { SystemHealthController } from '../../api/admin/system-health.controller';
import { SecuritySettingsController } from '../../api/admin/security-settings.controller';
import { SystemHealthModule } from './system-health/system-health.module';

const ADMIN_HANDLERS = [
  RegisterTenantHandler,
  ListOrganizationsHandler,
  GetOrganizationHandler,
  CreateTenantHandler,
  UpdateOrganizationHandler,
  ArchiveOrganizationHandler,
  SuspendOrganizationHandler,
  ReinstateOrganizationHandler,
  SearchUsersHandler,
  ResetUserPasswordHandler,
  ListPlansAdminHandler,
  CreatePlanHandler,
  UpdatePlanHandler,
  DeletePlanHandler,
  ListVerticalsAdminHandler,
  CreateVerticalAdminHandler,
  UpdateVerticalAdminHandler,
  DeleteVerticalAdminHandler,
  GetPlatformMetricsHandler,
  ListAuditLogHandler,
  LogPlatformSettingUpdateHandler,
  StartImpersonationHandler,
  EndImpersonationHandler,
  ListImpersonationSessionsHandler,
  ExpireImpersonationSessionsCron,
  OrgsWithoutOwnerCron,
  ListSubscriptionsHandler,
  GetOrgBillingHandler,
  ListSubscriptionInvoicesHandler,
  ListZohoSaasInvoicesHandler,
  GetBillingMetricsHandler,
  AdminWaiveInvoiceHandler,
  AdminGrantCreditHandler,
  AdminChangePlanForOrgHandler,
  AdminRefundInvoiceHandler,
  AdminForceChargeHandler,
  AdminCancelScheduledHandler,
  ListNotificationDeliveryLogHandler,
];

@Module({
  imports: [
    DatabaseModule,
    TenantModule,
    VerticalsModule,
    FinanceModule,
    IdentityModule,
    BillingModule,
    PlatformSettingsModule,
    PlatformEmailModule,
    NotificationsConfigModule,
    SystemHealthModule,
    MailModule,
    MessagingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],

  controllers: [
    DashboardPlatformController,
    DashboardVerticalsController,
    AdminOrganizationsController,
    AdminUsersController,
    AdminPlansController,
    AdminVerticalsController,
    AdminMetricsController,
    AdminAuditLogController,
    AdminImpersonationController,
    AdminBillingController,
    AdminNotificationsController,
    PlatformEmailController,
    AdminNotificationsConfigController,
    BillingSettingsController,
    BrandingSettingsController,
    SystemHealthController,
    SecuritySettingsController,
  ],
  providers: [
    SuperAdminContextInterceptor,
    AdminHostGuard,
    SuperAdminGuard,
    OwnerOnlyGuard,
    RedisService,
    PasswordService,
    CreateProblemReportHandler,
    ListProblemReportsHandler,
    UpdateProblemReportStatusHandler,
    UpsertIntegrationHandler,
    ListIntegrationsHandler,
    ...ADMIN_HANDLERS,
  ],
  exports: [
    CreateProblemReportHandler,
    ListProblemReportsHandler,
    UpdateProblemReportStatusHandler,
    UpsertIntegrationHandler,
    ListIntegrationsHandler,
    ...ADMIN_HANDLERS,
  ],
})
export class PlatformModule {}
