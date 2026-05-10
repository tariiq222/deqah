import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BullMqService } from '../../../infrastructure/queue/bull-mq.service';
import { BookingAutocompleteCron } from './booking-autocomplete.cron';
import { BookingExpiryCron } from './booking-expiry.cron';
import { BookingNoShowCron } from './booking-noshow.cron';
import { AppointmentRemindersCron } from './appointment-reminders.cron';
import { GroupSessionAutomationCron } from './group-session-automation.cron';
import { RefreshTokenCleanupCron } from './refresh-token-cleanup.cron';
import { MeterUsageCron } from '../../platform/billing/meter-usage/meter-usage.cron';
import { ChargeDueSubscriptionsCron } from '../../platform/billing/charge-due-subscriptions/charge-due-subscriptions.cron';
import { ComputeOverageCron } from '../../platform/billing/compute-overage/compute-overage.cron';
import { EnforceGracePeriodCron } from '../../platform/billing/enforce-grace-period/enforce-grace-period.cron';
import { ExpireImpersonationSessionsCron } from '../../platform/admin/expire-impersonation-sessions/expire-impersonation-sessions.cron';
import { ExpireTrialsCron } from '../../platform/billing/expire-trials/expire-trials.cron';
import { SendLimitWarningCron } from '../../platform/billing/send-limit-warning/send-limit-warning.cron';
import { ProcessScheduledPlanChangesCron } from '../../platform/billing/process-scheduled-plan-changes/process-scheduled-plan-changes.cron';
import { DunningRetryCron } from '../../platform/billing/dunning-retry/dunning-retry.cron';
import { DbRowCountCron } from './db-row-count.cron';
import { RunOrphanAuditHandler } from '../orphan-audit/run-orphan-audit.handler';
import { ReconcileUsageCountersHandler } from './reconcile-usage-counters/reconcile-usage-counters.handler';
import { ReconcileRefundsCron } from './reconcile-refunds.cron';
import { OutboxPublisherCron } from './outbox-publisher.cron';

const QUEUE_NAME = 'ops-cron';

export const CRON_JOBS = {
  BOOKING_AUTOCOMPLETE: 'booking-autocomplete',
  BOOKING_EXPIRY: 'booking-expiry',
  BOOKING_NOSHOW: 'booking-noshow',
  APPOINTMENT_REMINDERS: 'appointment-reminders',
  GROUP_SESSION_AUTOMATION: 'group-session-automation',
  REFRESH_TOKEN_CLEANUP: 'refresh-token-cleanup',
  METER_USAGE: 'meter-usage',
  CHARGE_DUE_SUBSCRIPTIONS: 'charge-due-subscriptions',
  ENFORCE_GRACE_PERIOD: 'enforce-grace-period',
  EXPIRE_IMPERSONATION_SESSIONS: 'expire-impersonation-sessions',
  EXPIRE_TRIALS: 'expire-trials',
  USAGE_WARNINGS: 'usage-warnings',
  PROCESS_SCHEDULED_PLAN_CHANGES: 'process-scheduled-plan-changes',
  DUNNING_RETRY: 'dunning-retry',
  DB_ROW_COUNT: 'db-row-count',
  ORPHAN_AUDIT: 'orphan-audit',
  RECONCILE_USAGE_COUNTERS: 'reconcile-usage-counters',
  RECONCILE_REFUNDS: 'reconcile-refunds',
  OUTBOX_PUBLISHER: 'outbox-publisher',
} as const;

@Injectable()
export class CronTasksService implements OnModuleInit {
  private readonly logger = new Logger(CronTasksService.name);

  constructor(
    private readonly bullMq: BullMqService,
    private readonly bookingAutocomplete: BookingAutocompleteCron,
    private readonly bookingExpiry: BookingExpiryCron,
    private readonly bookingNoShow: BookingNoShowCron,
    private readonly appointmentReminders: AppointmentRemindersCron,
    private readonly groupSessionAutomation: GroupSessionAutomationCron,
    private readonly refreshTokenCleanup: RefreshTokenCleanupCron,
    private readonly meterUsage: MeterUsageCron,
    private readonly chargeDueSubscriptions: ChargeDueSubscriptionsCron,
    private readonly computeOverage: ComputeOverageCron,
    private readonly enforceGracePeriod: EnforceGracePeriodCron,
    private readonly expireImpersonationSessions: ExpireImpersonationSessionsCron,
    private readonly expireTrials: ExpireTrialsCron,
    private readonly usageWarnings: SendLimitWarningCron,
    private readonly processScheduledPlanChanges: ProcessScheduledPlanChangesCron,
    private readonly dunningRetry: DunningRetryCron,
    private readonly dbRowCount: DbRowCountCron,
    private readonly orphanAudit: RunOrphanAuditHandler,
    private readonly reconcileUsageCounters: ReconcileUsageCountersHandler,
    private readonly reconcileRefunds: ReconcileRefundsCron,
    private readonly outboxPublisher: OutboxPublisherCron,
  ) {}

  onModuleInit(): void {
    this.registerRepeatingJobs();
    this.registerWorker();
  }

  private registerRepeatingJobs(): void {
    const queue = this.bullMq.getQueue(QUEUE_NAME);

    const jobs: Array<{ name: string; cron: string }> = [
      { name: CRON_JOBS.BOOKING_AUTOCOMPLETE, cron: '*/15 * * * *' },
      { name: CRON_JOBS.BOOKING_EXPIRY, cron: '*/10 * * * *' },
      { name: CRON_JOBS.BOOKING_NOSHOW, cron: '*/5 * * * *' },
      { name: CRON_JOBS.APPOINTMENT_REMINDERS, cron: '0 * * * *' },
      { name: CRON_JOBS.GROUP_SESSION_AUTOMATION, cron: '*/30 * * * *' },
      { name: CRON_JOBS.REFRESH_TOKEN_CLEANUP, cron: '0 3 * * *' },
      { name: CRON_JOBS.METER_USAGE, cron: '0 2 * * *' },           // daily at 02:00 AST
      { name: CRON_JOBS.CHARGE_DUE_SUBSCRIPTIONS, cron: '0 * * * *' }, // hourly
      { name: CRON_JOBS.ENFORCE_GRACE_PERIOD, cron: '0 * * * *' },   // hourly
      { name: CRON_JOBS.EXPIRE_IMPERSONATION_SESSIONS, cron: '* * * * *' }, // every minute
      { name: CRON_JOBS.EXPIRE_TRIALS, cron: '0 * * * *' }, // hourly
      { name: CRON_JOBS.USAGE_WARNINGS, cron: '0 9 * * *' }, // daily at 09:00 AST
      { name: CRON_JOBS.PROCESS_SCHEDULED_PLAN_CHANGES, cron: '0 2 * * *' }, // daily
      { name: CRON_JOBS.DUNNING_RETRY, cron: '0 * * * *' }, // hourly
      { name: CRON_JOBS.DB_ROW_COUNT, cron: '0 1 * * 0' }, // weekly Sunday 01:00
      { name: CRON_JOBS.ORPHAN_AUDIT, cron: '0 2 * * 0' }, // weekly Sunday 02:00
      { name: CRON_JOBS.RECONCILE_USAGE_COUNTERS, cron: '0 3 * * *' }, // daily at 03:00 KSA (= UTC+3)
      { name: CRON_JOBS.RECONCILE_REFUNDS, cron: '*/15 * * * *' },    // every 15 min
      { name: CRON_JOBS.OUTBOX_PUBLISHER, cron: '*/1 * * * *' },      // every minute (BullMQ min granularity; real tick is every 5s via worker loop)
    ];

    for (const { name, cron } of jobs) {
      queue
        .add(
          name,
          {},
          {
            repeat: { pattern: cron },
            jobId: `repeat:${name}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
          },
        )
        .catch((err: unknown) =>
          this.logger.error(`Failed to schedule ${name}`, err),
        );
    }

    this.logger.log(`Scheduled ${jobs.length} cron jobs on queue "${QUEUE_NAME}"`);
  }

  private registerWorker(): void {
    const worker = this.bullMq.createWorker<object>(QUEUE_NAME, async (job) => {
      const started = Date.now();
      try {
        switch (job.name) {
          case CRON_JOBS.BOOKING_AUTOCOMPLETE:
            await this.bookingAutocomplete.execute();
            break;
          case CRON_JOBS.BOOKING_EXPIRY:
            await this.bookingExpiry.execute();
            break;
          case CRON_JOBS.BOOKING_NOSHOW:
            await this.bookingNoShow.execute();
            break;
          case CRON_JOBS.APPOINTMENT_REMINDERS:
            await this.appointmentReminders.execute();
            break;
          case CRON_JOBS.GROUP_SESSION_AUTOMATION:
            await this.groupSessionAutomation.execute();
            break;
          case CRON_JOBS.REFRESH_TOKEN_CLEANUP:
            await this.refreshTokenCleanup.execute();
            break;
          case CRON_JOBS.METER_USAGE:
            await this.meterUsage.execute();
            break;
          case CRON_JOBS.CHARGE_DUE_SUBSCRIPTIONS:
            await this.chargeDueSubscriptions.execute();
            break;
          case CRON_JOBS.ENFORCE_GRACE_PERIOD:
            await this.enforceGracePeriod.execute();
            break;
          case CRON_JOBS.EXPIRE_IMPERSONATION_SESSIONS:
            await this.expireImpersonationSessions.execute();
            break;
          case CRON_JOBS.EXPIRE_TRIALS:
            await this.expireTrials.execute();
            break;
          case CRON_JOBS.USAGE_WARNINGS:
            await this.usageWarnings.execute();
            break;
          case CRON_JOBS.PROCESS_SCHEDULED_PLAN_CHANGES:
            await this.processScheduledPlanChanges.execute();
            break;
          case CRON_JOBS.DUNNING_RETRY:
            await this.dunningRetry.execute();
            break;
          case CRON_JOBS.DB_ROW_COUNT:
            await this.dbRowCount.execute();
            break;
          case CRON_JOBS.ORPHAN_AUDIT:
            await this.orphanAudit.execute();
            break;
          case CRON_JOBS.RECONCILE_USAGE_COUNTERS:
            await this.reconcileUsageCounters.execute();
            break;
          case CRON_JOBS.RECONCILE_REFUNDS:
            await this.reconcileRefunds.execute();
            break;
          case CRON_JOBS.OUTBOX_PUBLISHER:
            await this.outboxPublisher.execute();
            break;
          default:
            this.logger.warn(`Unknown cron job: ${job.name}`);
            return;
        }
        this.logger.log(`Cron ${job.name} ok in ${Date.now() - started}ms`);
      } catch (err) {
        this.logger.error(
          `Cron ${job.name} failed (attempt ${job.attemptsMade + 1})`,
          err instanceof Error ? err.stack : err,
        );
        throw err; // re-throw so BullMQ records the failure and applies backoff
      }
    });

    worker.on('failed', (job, err) => {
      const exhausted = job ? job.attemptsMade >= (job.opts.attempts ?? 1) : true;
      if (exhausted) {
        this.logger.error(
          `Cron ${job?.name ?? 'unknown'} EXHAUSTED retries — job ${job?.id} → DLQ`,
          err.stack,
        );
      }
    });
  }
}
