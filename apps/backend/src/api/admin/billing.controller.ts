import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AdminHostGuard, JwtGuard, OwnerOnlyGuard, SuperAdminGuard } from '../../common/guards';
import { SuperAdminContextInterceptor } from '../../common/interceptors';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ApiStandardResponses } from '../../common/swagger';
import { ListSubscriptionsHandler } from '../../modules/platform/admin/list-subscriptions/list-subscriptions.handler';
import { GetOrgBillingHandler } from '../../modules/platform/admin/get-org-billing/get-org-billing.handler';
import { ListSubscriptionInvoicesHandler } from '../../modules/platform/admin/list-subscription-invoices/list-subscription-invoices.handler';
import { ListZohoSaasInvoicesHandler } from '../../modules/platform/admin/list-zoho-saas-invoices/list-zoho-saas-invoices.handler';
import { GetBillingMetricsHandler } from '../../modules/platform/admin/get-billing-metrics/get-billing-metrics.handler';
import { AdminWaiveInvoiceHandler } from '../../modules/platform/admin/admin-waive-invoice/admin-waive-invoice.handler';
import { AdminGrantCreditHandler } from '../../modules/platform/admin/admin-grant-credit/admin-grant-credit.handler';
import { AdminChangePlanForOrgHandler } from '../../modules/platform/admin/admin-change-plan-for-org/admin-change-plan-for-org.handler';
import { AdminRefundInvoiceHandler } from '../../modules/platform/admin/admin-refund-invoice/admin-refund-invoice.handler';
import { AdminForceChargeHandler } from '../../modules/platform/admin/admin-force-charge/admin-force-charge.handler';
import { AdminCancelScheduledHandler } from '../../modules/platform/admin/admin-cancel-scheduled/admin-cancel-scheduled.handler';
import {
  AdminBillingMetricsDto,
  AdminCancelScheduledDto,
  AdminChangePlanResultDto,
  AdminForceChargeResultDto,
  AdminInvoiceRefundResultDto,
  AdminSubscriptionInvoiceDto,
  AdminSubscriptionSummaryDto,
  AdminWaiveInvoiceResultDto,
  BillingCreditDto,
  ChangePlanForOrgDto,
  GrantCreditDto,
  ListSubscriptionInvoicesQueryDto,
  ListSubscriptionsQueryDto,
  RefundInvoiceDto,
  WaiveInvoiceDto,
} from './dto/billing.dto';
import { PaginationMetaDto } from '../../common/swagger/api-paginated.dto';

@ApiTags('Admin / Billing')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/billing')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
@ApiExtraModels(
  PaginationMetaDto,
  AdminSubscriptionSummaryDto,
  AdminSubscriptionInvoiceDto,
)
export class AdminBillingController {
  constructor(
    private readonly listSubs: ListSubscriptionsHandler,
    private readonly getOrgBilling: GetOrgBillingHandler,
    private readonly listInvoices: ListSubscriptionInvoicesHandler,
    private readonly listZohoSaasInvoices: ListZohoSaasInvoicesHandler,
    private readonly getMetrics: GetBillingMetricsHandler,
    private readonly waiveInvoice: AdminWaiveInvoiceHandler,
    private readonly grantCredit: AdminGrantCreditHandler,
    private readonly changePlanForOrg: AdminChangePlanForOrgHandler,
    private readonly refundInvoice: AdminRefundInvoiceHandler,
    private readonly forceCharge: AdminForceChargeHandler,
    private readonly cancelScheduled: AdminCancelScheduledHandler,
  ) {}

  @Get('subscriptions')
  @ApiOperation({ summary: 'List all subscriptions across tenants' })
  @ApiOkResponse({
    description: 'Paginated list of subscriptions',
    schema: {
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array', items: { $ref: getSchemaPath(AdminSubscriptionSummaryDto) } },
        meta: { $ref: getSchemaPath(PaginationMetaDto) },
      },
    },
  })
  list(@Query() q: ListSubscriptionsQueryDto) {
    return this.listSubs.execute({
      page: q.page ?? 1,
      perPage: q.perPage ?? 20,
      status: q.status,
      planId: q.planId,
    });
  }

  @Get('subscriptions/:orgId')
  @ApiOperation({ summary: 'Get full billing detail for one organization' })
  @ApiParam({ name: 'orgId', description: 'Organization ID', format: 'uuid' })
  @ApiOkResponse({ description: 'Billing detail for the organization' })
  getOrg(@Param('orgId') orgId: string) {
    return this.getOrgBilling.execute({ organizationId: orgId });
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List subscription invoices across tenants' })
  @ApiOkResponse({
    description: 'Paginated list of subscription invoices',
    schema: {
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array', items: { $ref: getSchemaPath(AdminSubscriptionInvoiceDto) } },
        meta: { $ref: getSchemaPath(PaginationMetaDto) },
      },
    },
  })
  invoices(@Query() q: ListSubscriptionInvoicesQueryDto) {
    return this.listInvoices.execute({
      page: q.page ?? 1,
      perPage: q.perPage ?? 20,
      status: q.status,
      organizationId: q.organizationId,
      fromDate: q.fromDate,
      toDate: q.toDate,
      includeDrafts: q.includeDrafts ?? false,
    });
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Retrieve aggregate billing metrics (MRR, ARR, churn, by-plan)' })
  @ApiOkResponse({ type: AdminBillingMetricsDto, description: 'Platform-wide billing metrics' })
  metrics() {
    return this.getMetrics.execute();
  }

  @Get('zoho/invoices')
  @ApiOperation({
    summary:
      'List subscription invoices joined with their Zoho SaaS-billing mirror status (admin Zoho schedule view)',
  })
  @ApiOkResponse({
    description: 'Paginated invoices + Zoho mirror metadata',
    schema: {
      type: 'object',
      required: ['items', 'meta'],
      properties: {
        items: { type: 'array' },
        meta: { $ref: getSchemaPath(PaginationMetaDto) },
      },
    },
  })
  zohoInvoices(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: string,
    @Query('zohoMirrored') zohoMirrored?: 'yes' | 'no',
  ) {
    return this.listZohoSaasInvoices.execute({
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 20,
      organizationId,
      status: status as never,
      zohoMirrored,
    });
  }

  @Post('invoices/:id/waive')
  @UseGuards(OwnerOnlyGuard)
  @Throttle({ 'admin-mutation-slow': { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Waive a DUE or FAILED invoice (sets status=VOID; audited)' })
  @ApiParam({ name: 'id', description: 'Invoice ID', format: 'uuid' })
  @ApiOkResponse({ type: AdminWaiveInvoiceResultDto, description: 'Voided invoice' })
  waive(
    @Param('id') id: string,
    @Body() dto: WaiveInvoiceDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    return this.waiveInvoice.execute({
      invoiceId: id,
      superAdminUserId: user.id,
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post('credits')
  @UseGuards(OwnerOnlyGuard)
  @Throttle({ 'admin-mutation-slow': { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Grant a billing credit to an organization (audited)' })
  @ApiOkResponse({ type: BillingCreditDto, description: 'Created billing credit' })
  grant(
    @Body() dto: GrantCreditDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    return this.grantCredit.execute({
      organizationId: dto.organizationId,
      amount: dto.amount,
      currency: dto.currency ?? 'SAR',
      reason: dto.reason,
      superAdminUserId: user.id,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post('invoices/:id/refund')
  @UseGuards(OwnerOnlyGuard)
  @Throttle({ 'admin-mutation-slow': { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Refund a PAID invoice via Moyasar (full or partial; idempotent; audited)',
  })
  @ApiParam({ name: 'id', description: 'Invoice ID', format: 'uuid' })
  @ApiOkResponse({ type: AdminInvoiceRefundResultDto, description: 'Updated invoice after refund' })
  refund(
    @Param('id') id: string,
    @Body() dto: RefundInvoiceDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    return this.refundInvoice.execute({
      invoiceId: id,
      amount: dto.amount,
      superAdminUserId: user.id,
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post('subscriptions/:orgId/force-charge')
  @UseGuards(OwnerOnlyGuard)
  @Throttle({ 'admin-mutation-slow': { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Force an immediate payment retry for a PAST_DUE subscription (audited)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID', format: 'uuid' })
  @ApiOkResponse({ type: AdminForceChargeResultDto, description: 'Result of the force-charge attempt' })
  forceChargeOrg(
    @Param('orgId') orgId: string,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    return this.forceCharge.execute({
      organizationId: orgId,
      superAdminUserId: user.id,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post('subscriptions/:orgId/cancel-scheduled')
  @UseGuards(OwnerOnlyGuard)
  @Throttle({ 'admin-mutation-slow': { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancel a scheduled end-of-period cancellation (audited)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID', format: 'uuid' })
  @ApiOkResponse({ type: AdminCancelScheduledDto, description: 'Updated subscription with cancelAtPeriodEnd=false' })
  cancelScheduledCancellation(
    @Param('orgId') orgId: string,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    return this.cancelScheduled.execute({
      organizationId: orgId,
      superAdminUserId: user.id,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Patch('subscriptions/:orgId/plan')
  @UseGuards(OwnerOnlyGuard)
  @Throttle({ 'admin-mutation-slow': { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Change an organization plan immediately (no proration; audited)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID', format: 'uuid' })
  @ApiOkResponse({ type: AdminChangePlanResultDto, description: 'Subscription with updated plan' })
  changePlan(
    @Param('orgId') orgId: string,
    @Body() dto: ChangePlanForOrgDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    return this.changePlanForOrg.execute({
      organizationId: orgId,
      newPlanId: dto.newPlanId,
      superAdminUserId: user.id,
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }
}
