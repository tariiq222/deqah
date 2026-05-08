/**
 * Response DTOs for admin API controllers.
 * Co-located here per the brief; reuse across all admin controllers.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationStatus, SuperAdminActionType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Shared pagination meta (different shape from PaginationMetaDto — uses
// perPage instead of pageSize to match what admin handlers actually return)
// ---------------------------------------------------------------------------

export class AdminPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  perPage!: number;

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 6 })
  totalPages!: number;
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export class OrganizationSubscriptionSummaryDto {
  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiPropertyOptional()
  plan?: { slug: string; nameEn: string };
}

export class OrganizationListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'riyadh-clinic' })
  slug!: string;

  @ApiProperty({ example: 'عيادة الرياض' })
  nameAr!: string;

  @ApiPropertyOptional({ example: 'Riyadh Clinic' })
  nameEn?: string | null;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  verticalId?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  trialEndsAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  suspendedAt?: Date | null;

  @ApiPropertyOptional()
  suspendedReason?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: OrganizationSubscriptionSummaryDto })
  subscription?: OrganizationSubscriptionSummaryDto | null;
}

export class OrganizationListResponseDto {
  @ApiProperty({ type: [OrganizationListItemDto] })
  items!: OrganizationListItemDto[];

  @ApiProperty({ type: AdminPaginationMetaDto })
  meta!: AdminPaginationMetaDto;
}

export class OrganizationStatsDto {
  @ApiProperty()
  memberCount!: number;

  @ApiProperty()
  bookingCount30d!: number;

  @ApiProperty()
  totalRevenue!: number;
}

export class OrganizationDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiPropertyOptional()
  nameEn?: string | null;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiPropertyOptional()
  verticalId?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  trialEndsAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  suspendedAt?: Date | null;

  @ApiPropertyOptional()
  suspendedReason?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: OrganizationStatsDto })
  stats!: OrganizationStatsDto;
}

export class OrganizationCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiPropertyOptional()
  nameEn?: string | null;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  verticalId?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  trialEndsAt?: Date | null;

  @ApiProperty({ format: 'date-time' })
  onboardingCompletedAt?: Date | null;
}

export class OrganizationUpdatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiPropertyOptional()
  nameEn?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  verticalId?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  trialEndsAt?: Date | null;

  @ApiProperty({ enum: OrganizationStatus })
  status!: OrganizationStatus;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export class PlanResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'STARTER' })
  slug!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty()
  priceMonthly!: number;

  @ApiProperty()
  priceAnnual!: number;

  @ApiProperty({ example: 'SAR' })
  currency!: string;

  @ApiProperty()
  limits!: Record<string, unknown>;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class PlanWithCountDto extends PlanResponseDto {
  @ApiProperty()
  _count!: { subscriptions: number };
}

// ---------------------------------------------------------------------------
// Verticals
// ---------------------------------------------------------------------------

export class VerticalResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'family-consulting' })
  slug!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiPropertyOptional()
  templateFamily?: string;

  @ApiPropertyOptional()
  descriptionAr?: string | null;

  @ApiPropertyOptional()
  descriptionEn?: string | null;

  @ApiPropertyOptional()
  iconUrl?: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class VerticalListResponseDto {
  @ApiProperty({ type: [VerticalResponseDto] })
  items!: VerticalResponseDto[];

  @ApiProperty({ type: AdminPaginationMetaDto })
  meta!: AdminPaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export class AuditLogEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SuperAdminActionType })
  actionType!: SuperAdminActionType;

  @ApiProperty({ format: 'uuid' })
  superAdminUserId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  organizationId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  impersonationSessionId?: string | null;

  @ApiPropertyOptional()
  reason?: string | null;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  ipAddress?: string | null;

  @ApiPropertyOptional()
  userAgent?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  items!: AuditLogEntryDto[];

  @ApiProperty({ type: AdminPaginationMetaDto })
  meta!: AdminPaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Impersonation
// ---------------------------------------------------------------------------

export class ImpersonationStartResultDto {
  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ description: '15-minute shadow JWT for impersonation' })
  shadowAccessToken!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ example: 'https://app.deqah.app/?_impersonation=...' })
  redirectUrl!: string;
}

export class ImpersonationSessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  superAdminUserId!: string;

  @ApiProperty({ format: 'uuid' })
  targetUserId!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ format: 'date-time' })
  startedAt!: Date;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  endedAt?: Date | null;

  @ApiPropertyOptional()
  endedReason?: string | null;

  @ApiPropertyOptional()
  ipAddress?: string | null;

  @ApiPropertyOptional()
  userAgent?: string | null;
}

export class ImpersonationSessionListResponseDto {
  @ApiProperty({ type: [ImpersonationSessionDto] })
  items!: ImpersonationSessionDto[];

  @ApiProperty({ type: AdminPaginationMetaDto })
  meta!: AdminPaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export class OrganizationMetricsDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  active!: number;

  @ApiProperty()
  suspended!: number;

  @ApiProperty()
  newThisMonth!: number;
}

export class PlatformMetricsDto {
  @ApiProperty({ type: OrganizationMetricsDto })
  organizations!: OrganizationMetricsDto;

  @ApiProperty()
  users!: { total: number };

  @ApiProperty()
  bookings!: { totalLast30Days: number };

  @ApiProperty()
  revenue!: { lifetimePaidSar: number };

  @ApiProperty()
  subscriptions!: { byPlan: Record<string, number>; byStatus: Record<string, number> };
}

// ---------------------------------------------------------------------------
// Notifications delivery log
// ---------------------------------------------------------------------------

export class NotificationDeliveryLogEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  recipientId?: string | null;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  priority!: string;

  @ApiProperty()
  channel!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  toAddress?: string | null;

  @ApiPropertyOptional()
  providerName?: string | null;

  @ApiProperty()
  attempts!: number;

  @ApiPropertyOptional({ format: 'date-time' })
  lastAttemptAt?: Date | null;

  @ApiPropertyOptional({ format: 'date-time' })
  sentAt?: Date | null;

  @ApiPropertyOptional()
  errorMessage?: string | null;

  @ApiPropertyOptional()
  jobId?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class NotificationDeliveryLogListResponseDto {
  @ApiProperty({ type: [NotificationDeliveryLogEntryDto] })
  items!: NotificationDeliveryLogEntryDto[];

  @ApiProperty({ type: AdminPaginationMetaDto })
  meta!: AdminPaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export class UserMembershipSummaryDto {
  @ApiProperty()
  role!: string;

  @ApiProperty()
  organization!: { id: string; nameAr: string; nameEn: string | null; slug: string };
}

export class AdminUserListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isSuperAdmin!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: [UserMembershipSummaryDto] })
  memberships!: UserMembershipSummaryDto[];
}

export class AdminUserListResponseDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  items!: AdminUserListItemDto[];

  @ApiProperty({ type: AdminPaginationMetaDto })
  meta!: AdminPaginationMetaDto;
}

// ---------------------------------------------------------------------------
// Platform email templates
// ---------------------------------------------------------------------------

export class PlatformEmailTemplateListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isLocked!: boolean;

  @ApiProperty()
  version!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class PlatformEmailTemplateDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  subjectAr!: string;

  @ApiProperty()
  subjectEn!: string;

  @ApiProperty()
  htmlBody!: string;

  @ApiPropertyOptional()
  blocks?: unknown;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isLocked!: boolean;

  @ApiProperty()
  version!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  updatedById?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class PlatformEmailLogItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  organizationId?: string | null;

  @ApiProperty()
  templateSlug!: string;

  @ApiProperty()
  toAddress!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  providerMessageId?: string | null;

  @ApiPropertyOptional()
  errorMessage?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  sentAt?: Date | null;
}

export class PlatformEmailLogsResponseDto {
  @ApiProperty({ type: [PlatformEmailLogItemDto] })
  items!: PlatformEmailLogItemDto[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Cursor for next page; null when no more results' })
  nextCursor!: string | null;
}

export class EmailPreviewDto {
  @ApiProperty({ description: 'Rendered HTML of the template' })
  html!: string;

  @ApiPropertyOptional()
  subjectAr?: string;

  @ApiPropertyOptional()
  subjectEn?: string;
}
