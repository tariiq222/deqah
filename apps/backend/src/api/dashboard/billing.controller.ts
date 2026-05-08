import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { ApiOperation, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtGuard } from "../../common/guards/jwt.guard";
import { CaslGuard, CheckPermissions } from "../../common/guards/casl.guard";
import { AllowDuringSuspension } from "../../common/guards/allow-during-suspension.decorator";
import { ApiStandardResponses } from "../../common/swagger";
import { ListPlansHandler } from "../../modules/platform/billing/list-plans/list-plans.handler";
import { GetCurrentSubscriptionHandler } from "../../modules/platform/billing/get-current-subscription/get-current-subscription.handler";
import { GetMyFeaturesHandler } from "../../modules/platform/billing/get-my-features/get-my-features.handler";
import { StartSubscriptionHandler } from "../../modules/platform/billing/start-subscription/start-subscription.handler";
import { UpgradePlanHandler } from "../../modules/platform/billing/upgrade-plan/upgrade-plan.handler";
import { DowngradePlanHandler } from "../../modules/platform/billing/downgrade-plan/downgrade-plan.handler";
import { CancelSubscriptionHandler } from "../../modules/platform/billing/cancel-subscription/cancel-subscription.handler";
import { ReactivateSubscriptionHandler } from "../../modules/platform/billing/reactivate-subscription/reactivate-subscription.handler";
import { ResumeSubscriptionHandler } from "../../modules/platform/billing/resume-subscription/resume-subscription.handler";
import { StartSubscriptionDto } from "../../modules/platform/billing/dto/start-subscription.dto";
import {
  ChangePlanDto,
  ProrationPreviewDto,
} from "../../modules/platform/billing/dto/change-plan.dto";
import { AddSavedCardDto } from "../../modules/platform/billing/dto/saved-card.dto";
import { AddSavedCardHandler } from "../../modules/platform/billing/saved-cards/add-saved-card.handler";
import { ListSavedCardsHandler } from "../../modules/platform/billing/saved-cards/list-saved-cards.handler";
import { RemoveSavedCardHandler } from "../../modules/platform/billing/saved-cards/remove-saved-card.handler";
import { SetDefaultSavedCardHandler } from "../../modules/platform/billing/saved-cards/set-default-saved-card.handler";
import { ComputeProrationHandler } from "../../modules/platform/billing/compute-proration/compute-proration.handler";
import { ScheduleDowngradeHandler } from "../../modules/platform/billing/schedule-downgrade/schedule-downgrade.handler";
import { CancelScheduledDowngradeHandler } from "../../modules/platform/billing/cancel-scheduled-downgrade/cancel-scheduled-downgrade.handler";
import { RetryFailedPaymentHandler } from "../../modules/platform/billing/retry-failed-payment/retry-failed-payment.handler";
import { ListInvoicesHandler } from "../../modules/platform/billing/list-invoices/list-invoices.handler";
import { GetInvoiceHandler } from "../../modules/platform/billing/get-invoice/get-invoice.handler";
import { DownloadInvoiceHandler } from "../../modules/platform/billing/generate-invoice-pdf/download-invoice.handler";
import { ListInvoicesQueryDto } from "../../modules/platform/billing/dto/invoice.dto";
import { GetUsageHandler } from "../../modules/platform/billing/get-usage/get-usage.handler";
import { UsageRowDto } from "../../modules/platform/billing/get-usage/get-usage.dto";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { ChangePlanHandler } from "../../modules/platform/billing/change-plan/change-plan.handler";

@ApiTags("Dashboard / Billing")
@ApiBearerAuth()
@ApiStandardResponses()
@Controller("dashboard/billing")
@UseGuards(JwtGuard, CaslGuard)
export class BillingController {
  constructor(
    private readonly listPlans: ListPlansHandler,
    private readonly getCurrentSub: GetCurrentSubscriptionHandler,
    private readonly getMyFeatures: GetMyFeaturesHandler,
    private readonly startSub: StartSubscriptionHandler,
    private readonly upgrade: UpgradePlanHandler,
    private readonly downgrade: DowngradePlanHandler,
    private readonly cancel: CancelSubscriptionHandler,
    private readonly resume: ResumeSubscriptionHandler,
    private readonly listSavedCards: ListSavedCardsHandler,
    private readonly addSavedCard: AddSavedCardHandler,
    private readonly setDefaultSavedCard: SetDefaultSavedCardHandler,
    private readonly removeSavedCard: RemoveSavedCardHandler,
    private readonly reactivate: ReactivateSubscriptionHandler,
    private readonly proration: ComputeProrationHandler,
    private readonly scheduleDowngrade: ScheduleDowngradeHandler,
    private readonly cancelScheduledDowngrade: CancelScheduledDowngradeHandler,
    private readonly retryFailedPayment: RetryFailedPaymentHandler,
    private readonly listInvoicesHandler: ListInvoicesHandler,
    private readonly getInvoiceHandler: GetInvoiceHandler,
    private readonly downloadInvoiceHandler: DownloadInvoiceHandler,
    private readonly getUsage: GetUsageHandler,
    private readonly tenant: TenantContextService,
    private readonly changePlan: ChangePlanHandler,
  ) {}

  @Get("plans")
  @CheckPermissions({ action: 'read', subject: 'Billing' })
  @ApiOperation({ summary: "List available subscription plans" })
  plans() {
    return this.listPlans.execute();
  }

  @Get("subscription")
  @AllowDuringSuspension()
  @CheckPermissions({ action: 'read', subject: 'Subscription' })
  @ApiOperation({ summary: "Get current subscription" })
  subscription() {
    return this.getCurrentSub.execute();
  }

  @Get("my-features")
  @CheckPermissions({ action: 'read', subject: 'Billing' })
  @ApiOperation({ summary: "Get my billing features with current usage" })
  myFeatures() {
    return this.getMyFeatures.execute();
  }

  @Get("usage")
  @CheckPermissions({ action: 'read', subject: 'Billing' })
  @ApiOperation({ summary: "List quota usage for the current tenant" })
  @ApiOkResponse({ type: [UsageRowDto] })
  usage(): Promise<UsageRowDto[]> {
    const organizationId = this.tenant.requireOrganizationId();
    return this.getUsage.execute({ organizationId });
  }

  @Post("subscription/start")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @ApiOperation({ summary: "Start a new subscription (TRIALING)" })
  start(@Body() dto: StartSubscriptionDto) {
    return this.startSub.execute(dto);
  }

  @Post("subscription/upgrade")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @ApiOperation({ summary: "Upgrade subscription plan" })
  upgradePlan(@Body() dto: ChangePlanDto) {
    return this.upgrade.execute(dto);
  }

  @Post("subscription/change-plan")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @ApiOperation({ summary: "Change subscription plan (upgrade or downgrade)" })
  changePlanRoute(@Body() dto: ChangePlanDto) {
    return this.changePlan.execute(dto);
  }

  @Get("subscription/proration-preview")
  @CheckPermissions({ action: 'read', subject: 'Subscription' })
  @ApiOperation({ summary: "Preview prorated plan change" })
  prorationPreview(@Query() query: ProrationPreviewDto) {
    return this.proration.execute(query);
  }

  @Post("subscription/downgrade")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @ApiOperation({ summary: "Downgrade subscription plan" })
  downgradePlan(@Body() dto: ChangePlanDto) {
    return this.scheduleDowngrade.execute(dto);
  }

  @Post("subscription/schedule-downgrade")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @ApiOperation({ summary: "Schedule subscription downgrade at period end" })
  scheduleDowngradePlan(@Body() dto: ChangePlanDto) {
    return this.scheduleDowngrade.execute(dto);
  }

  @Post("subscription/cancel-scheduled-downgrade")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @HttpCode(200)
  @ApiOperation({ summary: "Cancel a scheduled subscription downgrade" })
  cancelScheduledDowngradePlan() {
    return this.cancelScheduledDowngrade.execute();
  }

  @Post("subscription/cancel")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @ApiOperation({ summary: "Cancel subscription" })
  cancelSub(@Body() body: { reason?: string }) {
    return this.cancel.execute(body);
  }

  @Post("subscription/schedule-cancel")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @ApiOperation({ summary: "Schedule subscription cancellation at period end" })
  scheduleCancelSub(@Body() body: { reason?: string }) {
    return this.cancel.execute(body);
  }

  @Post("subscription/resume")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @HttpCode(200)
  @ApiOperation({ summary: "Resume a suspended subscription" })
  resumeSub() {
    return this.resume.execute({});
  }

  @Post("subscription/reactivate")
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @HttpCode(200)
  @ApiOperation({ summary: "Reactivate a scheduled cancellation" })
  reactivateSub() {
    return this.reactivate.execute();
  }

  @Post("subscription/retry-payment")
  @AllowDuringSuspension()
  @CheckPermissions({ action: 'manage', subject: 'Subscription' })
  @HttpCode(200)
  @ApiOperation({ summary: "Retry failed subscription payment" })
  retryPayment() {
    return this.retryFailedPayment.execute();
  }

  @Get("saved-cards")
  @AllowDuringSuspension()
  @CheckPermissions({ action: 'read', subject: 'Billing' })
  @ApiOperation({ summary: "List saved billing cards" })
  savedCards() {
    return this.listSavedCards.execute();
  }

  @Post("saved-cards")
  @AllowDuringSuspension()
  @CheckPermissions({ action: 'manage', subject: 'Billing' })
  @ApiOperation({ summary: "Add a saved billing card" })
  addCard(@Body() dto: AddSavedCardDto) {
    return this.addSavedCard.execute(dto);
  }

  @Patch("saved-cards/:id/set-default")
  @AllowDuringSuspension()
  @CheckPermissions({ action: 'manage', subject: 'Billing' })
  @HttpCode(200)
  @ApiOperation({ summary: "Set saved billing card as default" })
  setDefaultCard(@Param("id") id: string) {
    return this.setDefaultSavedCard.execute(id);
  }

  @Delete("saved-cards/:id")
  @CheckPermissions({ action: 'manage', subject: 'Billing' })
  @HttpCode(200)
  @ApiOperation({ summary: "Remove a saved billing card" })
  removeCard(@Param("id") id: string) {
    return this.removeSavedCard.execute(id);
  }

  @Get("invoices")
  @CheckPermissions({ action: 'read', subject: 'Invoice' })
  @ApiOperation({ summary: "List billing invoices for current organization" })
  listInvoices(@Query() query: ListInvoicesQueryDto) {
    return this.listInvoicesHandler.execute(query);
  }

  @Get("invoices/:id")
  @CheckPermissions({ action: 'read', subject: 'Invoice' })
  @ApiOperation({ summary: "Get a single billing invoice" })
  getInvoice(@Param("id") id: string) {
    return this.getInvoiceHandler.execute(id);
  }

  @Get("invoices/:id/download")
  @CheckPermissions({ action: 'read', subject: 'Invoice' })
  @ApiOperation({ summary: "Get a presigned URL to download the invoice PDF" })
  downloadInvoice(@Param("id") id: string) {
    return this.downloadInvoiceHandler.execute(id);
  }
}
