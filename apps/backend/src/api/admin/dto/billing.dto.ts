import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingCycle, SubscriptionInvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListSubscriptionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;
}

export class ListSubscriptionInvoicesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;

  @ApiPropertyOptional({ enum: SubscriptionInvoiceStatus })
  @IsOptional()
  @IsEnum(SubscriptionInvoiceStatus)
  status?: SubscriptionInvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDrafts?: boolean;
}

export class WaiveInvoiceDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class GrantCreditDto {
  @ApiProperty()
  @IsString()
  organizationId!: string;

  @ApiProperty({ minimum: 1, maximum: 100000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100000)
  amount!: number;

  @ApiPropertyOptional({ enum: ['SAR'], default: 'SAR' })
  @IsOptional()
  @IsString()
  @IsIn(['SAR'])
  currency?: string;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class RefundInvoiceDto {
  @ApiPropertyOptional({
    description: 'Amount in SAR. Omit for full refund of remaining balance.',
    minimum: 0.01,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class ChangePlanForOrgDto {
  @ApiProperty()
  @IsString()
  newPlanId!: string;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class AdminSubscriptionPlanSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty({ type: Number })
  priceMonthly!: number;
}

export class AdminSubscriptionOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional()
  nameAr?: string | null;

  @ApiPropertyOptional()
  nameEn?: string | null;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  suspendedAt?: Date | null;
}

export class AdminSubscriptionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty({ enum: BillingCycle })
  billingCycle!: BillingCycle;

  @ApiProperty({ format: 'date-time' })
  currentPeriodStart!: Date;

  @ApiProperty({ format: 'date-time' })
  currentPeriodEnd!: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  trialEndsAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  canceledAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  pastDueSince?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  lastPaymentAt?: Date | null;

  @ApiPropertyOptional()
  lastFailureReason?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: () => AdminSubscriptionPlanSummaryDto })
  plan!: AdminSubscriptionPlanSummaryDto;

  @ApiProperty({ type: () => AdminSubscriptionOrganizationDto })
  organization!: AdminSubscriptionOrganizationDto;
}

export class AdminSubscriptionInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  subscriptionId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ type: Number })
  amount!: number;

  @ApiPropertyOptional({ type: Number })
  flatAmount?: number | null;

  @ApiPropertyOptional({ type: Number })
  overageAmount?: number | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: SubscriptionInvoiceStatus })
  status!: SubscriptionInvoiceStatus;

  @ApiProperty({ enum: BillingCycle })
  billingCycle!: BillingCycle;

  @ApiProperty({ format: 'date-time' })
  periodStart!: Date;

  @ApiProperty({ format: 'date-time' })
  periodEnd!: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  dueDate?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  issuedAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  paidAt?: Date | null;

  @ApiPropertyOptional({ type: Number })
  refundedAmount?: number | null;

  @ApiPropertyOptional({ format: 'date-time' })
  refundedAt?: Date | null;

  @ApiPropertyOptional()
  voidedReason?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class AdminBillingMetricsByPlanDto {
  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty()
  planSlug!: string;

  @ApiProperty({ type: Number })
  activeCount!: number;

  @ApiProperty({ description: 'MRR contribution from this plan in SAR (string decimal)' })
  mrr!: string;
}

export class AdminBillingMetricsDto {
  @ApiProperty({ description: 'Monthly Recurring Revenue in SAR (string decimal) — based on plan prices', example: '12500.00' })
  mrr!: string;

  @ApiProperty({ description: 'Realized MRR in SAR — actual revenue from PAID invoices this month', example: '11800.00' })
  realizedMrr!: string;

  @ApiProperty({ description: 'Annual Recurring Revenue in SAR (string decimal)', example: '150000.00' })
  arr!: string;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty({ description: 'Subscriptions canceled in the last 30 days', type: Number })
  churn30d!: number;

  @ApiProperty({ description: 'MRR at risk from SUSPENDED subscriptions in SAR', example: '500.00' })
  atRiskMrr!: string;

  @ApiProperty({ description: 'Count of ACTIVE subscriptions with a scheduled downgrade pending', type: Number })
  scheduledDowngrades!: number;

  @ApiProperty({
    description: 'Count per subscription status',
    additionalProperties: { type: 'integer' },
  })
  counts!: Record<SubscriptionStatus, number>;

  @ApiProperty({ type: [AdminBillingMetricsByPlanDto] })
  byPlan!: AdminBillingMetricsByPlanDto[];
}

export class BillingCreditDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ type: Number })
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ format: 'uuid' })
  grantedByUserId!: string;

  @ApiProperty({ format: 'date-time' })
  grantedAt!: Date;
}

export class AdminInvoiceRefundResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SubscriptionInvoiceStatus })
  status!: SubscriptionInvoiceStatus;

  @ApiProperty({ type: Number })
  amount!: number;

  @ApiPropertyOptional({ type: Number })
  refundedAmount?: number | null;

  @ApiPropertyOptional({ format: 'date-time' })
  refundedAt?: Date | null;
}

export class AdminForceChargeResultDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ description: 'Result from dunning retry' })
  result!: unknown;
}

export class AdminCancelScheduledDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty()
  cancelAtPeriodEnd!: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  canceledAt?: Date | null;

  @ApiProperty({ format: 'date-time' })
  currentPeriodEnd!: Date;
}

export class AdminChangePlanResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty({ format: 'date-time' })
  currentPeriodEnd!: Date;
}

export class AdminWaiveInvoiceResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SubscriptionInvoiceStatus })
  status!: SubscriptionInvoiceStatus;

  @ApiPropertyOptional()
  voidedReason?: string | null;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ type: Number })
  amount!: number;
}
