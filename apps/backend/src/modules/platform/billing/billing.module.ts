import { Global, Module, OnModuleInit } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { FeatureRegistryValidator } from "./feature-registry.validator";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule } from "../../../infrastructure/database/database.module";
import { MailModule } from "../../../infrastructure/mail";
import { MessagingModule } from "../../../infrastructure/messaging.module";
import { UsageCounterService } from "./usage-counter/usage-counter.service";
import { IncrementUsageListener } from "./usage-counter/increment-usage.listener";
import { DecrementOnLifecycleListener } from "./usage-counter/decrement-on-lifecycle.listener";
import { DecrementOnRefundListener } from "./usage-counter/decrement-on-refund/decrement-on-refund.listener";
import { CacheInvalidatorListener } from "./cache-invalidator.listener";
import { GetUsageHandler } from "./get-usage/get-usage.handler";
import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { SUBSCRIPTION_CACHE_TOKEN } from "../../../common/tenant/tenant-context.service";
import { BillingController } from "../../../api/dashboard/billing.controller";
import { SubscriptionStateMachine } from "./subscription-state-machine";
import { SubscriptionCacheService } from "./subscription-cache.service";
import { UsageAggregatorService } from "./usage-aggregator.service";
import { ListPlansHandler } from "./list-plans/list-plans.handler";
import { GetCurrentSubscriptionHandler } from "./get-current-subscription/get-current-subscription.handler";
import { GetMyFeaturesHandler } from "./get-my-features/get-my-features.handler";
import { StartSubscriptionHandler } from "./start-subscription/start-subscription.handler";
import { UpgradePlanHandler } from "./upgrade-plan/upgrade-plan.handler";
import { DowngradePlanHandler } from "./downgrade-plan/downgrade-plan.handler";
import { ComputeProrationHandler } from "./compute-proration/compute-proration.handler";
import { ScheduleDowngradeHandler } from "./schedule-downgrade/schedule-downgrade.handler";
import { CancelScheduledDowngradeHandler } from "./cancel-scheduled-downgrade/cancel-scheduled-downgrade.handler";
import { CancelSubscriptionHandler } from "./cancel-subscription/cancel-subscription.handler";
import { ProcessScheduledCancellationsCron } from "./process-scheduled-cancellations/process-scheduled-cancellations.cron";
import { SendLimitWarningCron } from "./send-limit-warning/send-limit-warning.cron";
import { ProcessScheduledPlanChangesCron } from "./process-scheduled-plan-changes/process-scheduled-plan-changes.cron";
import { DunningRetryCron } from "./dunning-retry/dunning-retry.cron";
import { DunningRetryService } from "./dunning-retry/dunning-retry.service";
import { RetryFailedPaymentHandler } from "./retry-failed-payment/retry-failed-payment.handler";
import { ReactivateSubscriptionHandler } from "./reactivate-subscription/reactivate-subscription.handler";
import { ResumeSubscriptionHandler } from "./resume-subscription/resume-subscription.handler";
import { RecordSubscriptionPaymentHandler } from "./record-subscription-payment/record-subscription-payment.handler";
import { IssueInvoiceHandler } from "./issue-invoice/issue-invoice.handler";
import { InvoiceNumberingService } from "./issue-invoice/invoice-numbering.service";
import { ListInvoicesHandler } from "./list-invoices/list-invoices.handler";
import { GetInvoiceHandler } from "./get-invoice/get-invoice.handler";
import { RecordSubscriptionPaymentFailureHandler } from "./record-subscription-payment-failure/record-subscription-payment-failure.handler";
import { AddSavedCardHandler } from "./saved-cards/add-saved-card.handler";
import { ListSavedCardsHandler } from "./saved-cards/list-saved-cards.handler";
import { RemoveSavedCardHandler } from "./saved-cards/remove-saved-card.handler";
import { SetDefaultSavedCardHandler } from "./saved-cards/set-default-saved-card.handler";
import { MoyasarSubscriptionClient } from "../../finance/moyasar-api/moyasar-subscription.client";
import { PlanLimitsGuard } from "./enforce-limits.guard";
import { FeatureGuard } from "./feature.guard";
import { UsageTrackerInterceptor } from "./usage-tracker.interceptor";
import { DowngradeSafetyService } from "./downgrade-safety/downgrade-safety.service";
import { ChangePlanHandler } from "./change-plan/change-plan.handler";
import { FeatureCheckService } from "./feature-check.service";
import { CustomDomainGraceCron } from "./grace-watchers/custom-domain-grace.cron";
import { ApiWebhooksGraceCron } from "./grace-watchers/api-webhooks-grace.cron";
import { LaunchFlags } from "./feature-flags/launch-flags";
import { CreatePlanVersionHandler } from "./plan-versions/create-plan-version.handler";

const HANDLERS = [
  ListPlansHandler,
  GetCurrentSubscriptionHandler,
  GetMyFeaturesHandler,
  StartSubscriptionHandler,
  ComputeProrationHandler,
  UpgradePlanHandler,
  DowngradePlanHandler,
  ScheduleDowngradeHandler,
  ChangePlanHandler,
  CancelScheduledDowngradeHandler,
  CancelSubscriptionHandler,
  ProcessScheduledCancellationsCron,
  SendLimitWarningCron,
  ProcessScheduledPlanChangesCron,
  DunningRetryService,
  DunningRetryCron,
  RetryFailedPaymentHandler,
  ReactivateSubscriptionHandler,
  ResumeSubscriptionHandler,
  ListSavedCardsHandler,
  AddSavedCardHandler,
  SetDefaultSavedCardHandler,
  RemoveSavedCardHandler,
  RecordSubscriptionPaymentHandler,
  RecordSubscriptionPaymentFailureHandler,
  MoyasarSubscriptionClient,
  IssueInvoiceHandler,
  InvoiceNumberingService,
  ListInvoicesHandler,
  GetInvoiceHandler,
];

@Global()
@Module({
  imports: [DatabaseModule, MailModule, MessagingModule],
  controllers: [BillingController],
  providers: [
    SubscriptionStateMachine,
    // Factory avoids DI trying to inject the optional 'options' parameter
    // (index [1] in the constructor) — it's for unit-test injection only.
    // ClsService (index [2]) is required so the cache can wrap its scoped-
    // model query in $allTenants under super-admin CLS when invoked from
    // cross-tenant code paths (cron jobs, password-reset email, etc.).
    {
      provide: SubscriptionCacheService,
      useFactory: (prisma: PrismaService, cls: ClsService) =>
        new SubscriptionCacheService(prisma, undefined, cls),
      inject: [PrismaService, ClsService],
    },
    UsageAggregatorService,
    // Expose SubscriptionCacheService under the token TenantContextService expects
    {
      provide: SUBSCRIPTION_CACHE_TOKEN,
      useExisting: SubscriptionCacheService,
    },
    ...HANDLERS,
    FeatureRegistryValidator,
    // FeatureGuard + PlanLimitsGuard are NO LONGER APP_GUARDs. They are
    // attached at the method level via the @RequireFeature / @EnforceLimit
    // decorators (see feature.decorator.ts / plan-limits.decorator.ts).
    // Listed as plain providers + exported below so any importing module's
    // controller can resolve them via DI when the bundled decorator's
    // UseGuards() reference fires.
    FeatureGuard,
    PlanLimitsGuard,
    { provide: APP_INTERCEPTOR, useClass: UsageTrackerInterceptor },
    UsageCounterService,
    IncrementUsageListener,
    DecrementOnLifecycleListener,
    DecrementOnRefundListener,
    CacheInvalidatorListener,
    GetUsageHandler,
    DowngradeSafetyService,
    FeatureCheckService,
    CustomDomainGraceCron,
    ApiWebhooksGraceCron,
    LaunchFlags,
    CreatePlanVersionHandler,
  ],
  exports: [
    LaunchFlags,
    CreatePlanVersionHandler,
    FeatureGuard,
    PlanLimitsGuard,
    SubscriptionCacheService,
    UsageAggregatorService,
    SubscriptionStateMachine,
    UsageCounterService,
    GetUsageHandler,
    DowngradeSafetyService,
    FeatureCheckService,
    ...HANDLERS,
  ],
})
export class BillingModule implements OnModuleInit {
  constructor(private readonly featureRegistry: FeatureRegistryValidator) {}

  onModuleInit(): void {
    // Fail fast on registry drift — see feature-registry.validator.ts.
    this.featureRegistry.validate();
  }
}
