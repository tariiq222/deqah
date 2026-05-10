import { Module, OnModuleInit } from '@nestjs/common';
import { DashboardOpsController } from '../../api/dashboard/ops.controller';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '../../infrastructure/database';
import { MessagingModule } from '../../infrastructure/messaging.module';
import { BookingsModule } from '../bookings/bookings.module';
import { BillingModule } from '../platform/billing/billing.module';
import { FinanceModule } from '../finance/finance.module';
import { CronTasksService } from './cron-tasks/cron-tasks.service';
import { BookingAutocompleteCron } from './cron-tasks/booking-autocomplete.cron';
import { BookingExpiryCron } from './cron-tasks/booking-expiry.cron';
import { BookingNoShowCron } from './cron-tasks/booking-noshow.cron';
import { AppointmentRemindersCron } from './cron-tasks/appointment-reminders.cron';
import { GroupSessionAutomationCron } from './cron-tasks/group-session-automation.cron';
import { RefreshTokenCleanupCron } from './cron-tasks/refresh-token-cleanup.cron';
import { LogActivityHandler } from './log-activity/log-activity.handler';
import { ListActivityHandler } from './log-activity/list-activity.handler';
import { GenerateReportHandler } from './generate-report/generate-report.handler';
import { HealthCheckHandler } from './health-check/health-check.handler';
// Billing crons (SaaS-04 Task 9)
import { MeterUsageCron } from '../platform/billing/meter-usage/meter-usage.cron';
import { ChargeDueSubscriptionsCron } from '../platform/billing/charge-due-subscriptions/charge-due-subscriptions.cron';
import { ComputeOverageCron } from '../platform/billing/compute-overage/compute-overage.cron';
import { EnforceGracePeriodCron } from '../platform/billing/enforce-grace-period/enforce-grace-period.cron';
import { ExpireImpersonationSessionsCron } from '../platform/admin/expire-impersonation-sessions/expire-impersonation-sessions.cron';
import { ExpireTrialsCron } from '../platform/billing/expire-trials/expire-trials.cron';
import { SendLimitWarningCron } from '../platform/billing/send-limit-warning/send-limit-warning.cron';
import { ProcessScheduledPlanChangesCron } from '../platform/billing/process-scheduled-plan-changes/process-scheduled-plan-changes.cron';
import { DunningRetryCron } from '../platform/billing/dunning-retry/dunning-retry.cron';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { DbRowCountCron } from './cron-tasks/db-row-count.cron';
import { DbMetricsService } from '../../infrastructure/telemetry/db-metrics.service';
import { RunOrphanAuditHandler } from './orphan-audit/run-orphan-audit.handler';
import { ReconcileUsageCountersHandler } from './cron-tasks/reconcile-usage-counters/reconcile-usage-counters.handler';
import { ReconcileRefundsCron } from './cron-tasks/reconcile-refunds.cron';
import { OutboxPublisherCron } from './cron-tasks/outbox-publisher.cron';

const handlers = [
  LogActivityHandler,
  ListActivityHandler,
  GenerateReportHandler,
  HealthCheckHandler,
];

const cronHandlers = [
  BookingAutocompleteCron,
  BookingExpiryCron,
  BookingNoShowCron,
  AppointmentRemindersCron,
  GroupSessionAutomationCron,
  RefreshTokenCleanupCron,
  // Billing crons
  MeterUsageCron,
  ChargeDueSubscriptionsCron,
  ComputeOverageCron,
  EnforceGracePeriodCron,
  ExpireTrialsCron,
  SendLimitWarningCron,
  ProcessScheduledPlanChangesCron,
  DunningRetryCron,
  // Admin crons
  ExpireImpersonationSessionsCron,
  // DB-12/13
  DbRowCountCron,
  // Phase 5 — usage counter reconciliation
  ReconcileUsageCountersHandler,
  // CR-6 — refund reconciliation
  ReconcileRefundsCron,
  // CR-5 — outbox publisher
  OutboxPublisherCron,
];

// Note: UsageAggregatorService, SubscriptionStateMachine and
// SubscriptionCacheService are *exported* from BillingModule. Re-declaring
// them here would create separate instances — the in-memory UsageAggregator
// Map would diverge between the request-time interceptor and the cron flush,
// silently dropping every increment. Import BillingModule instead.
//
// FinanceModule is imported to make MoyasarApiClient available to
// ReconcileRefundsCron. MoyasarApiClient is exported by FinanceModule.
@Module({
  imports: [DatabaseModule, MessagingModule, TerminusModule, BookingsModule, BillingModule, FinanceModule],
  controllers: [DashboardOpsController],
  providers: [...handlers, ...cronHandlers, RedisService, CronTasksService, DbMetricsService, RunOrphanAuditHandler],
  exports: [...handlers, RunOrphanAuditHandler],
})
export class OpsModule implements OnModuleInit {
  constructor(private readonly cronTasks: CronTasksService) {}

  onModuleInit(): void {
    // CronTasksService.onModuleInit() handles job scheduling + worker registration.
    // Explicitly called here to document the lifecycle dependency.
    void this.cronTasks;
  }
}
