import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiParam,
  ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse,
} from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { ApiStandardResponses } from '../../common/swagger';
import { ListNotificationsHandler } from '../../modules/comms/notifications/list-notifications.handler';
import { ListNotificationsDto } from '../../modules/comms/notifications/list-notifications.dto';
import { GetUnreadCountHandler } from '../../modules/comms/notifications/get-unread-count.handler';
import { MarkReadHandler } from '../../modules/comms/notifications/mark-read.handler';
import { MarkReadDto } from '../../modules/comms/notifications/mark-read.dto';
import { ListEmailTemplatesHandler } from '../../modules/comms/email-templates/list-email-templates.handler';
import { ListEmailTemplatesDto } from '../../modules/comms/email-templates/list-email-templates.dto';
import { GetEmailTemplateHandler } from '../../modules/comms/email-templates/get-email-template.handler';
import { CreateEmailTemplateHandler } from '../../modules/comms/email-templates/create-email-template.handler';
import { CreateEmailTemplateDto } from '../../modules/comms/email-templates/create-email-template.dto';
import { UpdateEmailTemplateHandler } from '../../modules/comms/email-templates/update-email-template.handler';
import { UpdateEmailTemplateDto } from '../../modules/comms/email-templates/update-email-template.dto';
import { PreviewEmailTemplateHandler } from '../../modules/comms/email-templates/preview-email-template.handler';
import { PreviewEmailTemplateDto } from '../../modules/comms/email-templates/preview-email-template.dto';
import { ListConversationsHandler } from '../../modules/comms/chat/list-conversations.handler';
import { ListConversationsDto } from '../../modules/comms/chat/list-conversations.dto';
import { ListMessagesHandler } from '../../modules/comms/chat/list-messages.handler';
import { ListMessagesDto } from '../../modules/comms/chat/list-messages.dto';
import { GetConversationHandler } from '../../modules/comms/chat/get-conversation.handler';
import { CloseConversationHandler } from '../../modules/comms/chat/close-conversation.handler';
import { SendStaffMessageHandler } from '../../modules/comms/chat/send-staff-message.handler';
import { SendStaffMessageDto } from '../../modules/comms/chat/send-staff-message.dto';
import { ListContactMessagesHandler } from '../../modules/comms/contact-messages/list-contact-messages.handler';
import { ListContactMessagesDto } from '../../modules/comms/contact-messages/list-contact-messages.dto';
import { UpdateContactMessageStatusHandler } from '../../modules/comms/contact-messages/update-contact-message-status.handler';
import { UpdateContactMessageStatusDto } from '../../modules/comms/contact-messages/update-contact-message-status.dto';
import { GetOrgSmsConfigHandler } from '../../modules/comms/org-sms-config/get-org-sms-config.handler';
import { UpsertOrgSmsConfigHandler } from '../../modules/comms/org-sms-config/upsert-org-sms-config.handler';
import { UpsertOrgSmsConfigDto } from '../../modules/comms/org-sms-config/upsert-org-sms-config.dto';
import { TestSmsConfigHandler } from '../../modules/comms/org-sms-config/test-sms-config.handler';
import { TestSmsConfigDto } from '../../modules/comms/org-sms-config/test-sms-config.dto';
import { GetOrgEmailConfigHandler } from '../../modules/comms/org-email-config/get-org-email-config.handler';
import { UpsertOrgEmailConfigHandler } from '../../modules/comms/org-email-config/upsert-org-email-config.handler';
import { UpsertOrgEmailConfigDto } from '../../modules/comms/org-email-config/upsert-org-email-config.dto';
import { TestEmailConfigHandler } from '../../modules/comms/org-email-config/test-email-config.handler';
import { TestEmailConfigDto } from '../../modules/comms/org-email-config/test-email-config.dto';
import { PrismaService } from '../../infrastructure/database';
import { TenantContextService } from '../../common/tenant';
import { RequireFeature } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { ListTenantDeliveryLogsHandler } from '../../modules/comms/list-tenant-delivery-logs/list-tenant-delivery-logs.handler';
import { ListTenantDeliveryLogsDto } from '../../modules/comms/list-tenant-delivery-logs/list-tenant-delivery-logs.dto';
import { UsageCounterService } from '../../modules/platform/billing/usage-counter/usage-counter.service';
import { SubscriptionCacheService } from '../../modules/platform/billing/subscription-cache.service';

@ApiTags('Dashboard / Comms')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('dashboard/comms')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardCommsController {
  constructor(
    private readonly listNotifications: ListNotificationsHandler,
    private readonly getUnreadCount: GetUnreadCountHandler,
    private readonly markRead: MarkReadHandler,
    private readonly listEmailTemplates: ListEmailTemplatesHandler,
    private readonly getEmailTemplate: GetEmailTemplateHandler,
    private readonly createEmailTemplate: CreateEmailTemplateHandler,
    private readonly updateEmailTemplate: UpdateEmailTemplateHandler,
    private readonly previewEmailTemplate: PreviewEmailTemplateHandler,
    private readonly listConversations: ListConversationsHandler,
    private readonly listMessages: ListMessagesHandler,
    private readonly getConversation: GetConversationHandler,
    private readonly closeConversation: CloseConversationHandler,
    private readonly sendStaffMessage: SendStaffMessageHandler,
    private readonly listContactMessages: ListContactMessagesHandler,
    private readonly updateContactMessageStatus: UpdateContactMessageStatusHandler,
    private readonly getOrgSmsConfig: GetOrgSmsConfigHandler,
    private readonly upsertOrgSmsConfig: UpsertOrgSmsConfigHandler,
    private readonly testSmsConfig: TestSmsConfigHandler,
    private readonly getOrgEmailConfig: GetOrgEmailConfigHandler,
    private readonly upsertOrgEmailConfig: UpsertOrgEmailConfigHandler,
    private readonly testEmailConfig: TestEmailConfigHandler,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly listTenantDeliveryLogs: ListTenantDeliveryLogsHandler,
    private readonly usageCounter: UsageCounterService,
    private readonly subscriptionCache: SubscriptionCacheService,
  ) {}

  // ── SMS Settings (SaaS-02g-sms) ────────────────────────────────────────────

  @RequireFeature(FeatureKey.SMS_PROVIDER_PER_TENANT)
  @ApiOperation({ summary: 'Get SMS provider configuration (owner-scoped)' })
  @ApiOkResponse({ description: 'OrganizationSmsConfig view (no secrets)' })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Get('settings/sms')
  getSmsConfigEndpoint() {
    return this.getOrgSmsConfig.execute();
  }

  @RequireFeature(FeatureKey.SMS_PROVIDER_PER_TENANT)
  @ApiOperation({ summary: 'Upsert SMS provider configuration' })
  @ApiOkResponse({ description: 'Updated OrganizationSmsConfig view' })
  @HttpCode(HttpStatus.OK)
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Post('settings/sms')
  upsertSmsConfigEndpoint(@Body() dto: UpsertOrgSmsConfigDto) {
    return this.upsertOrgSmsConfig.execute(dto);
  }

  @RequireFeature(FeatureKey.SMS_PROVIDER_PER_TENANT)
  @ApiOperation({ summary: 'Send a test SMS via the configured provider' })
  @ApiOkResponse({ description: 'Test result' })
  @HttpCode(HttpStatus.OK)
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Post('settings/sms/test')
  testSmsConfigEndpoint(@Body() dto: TestSmsConfigDto) {
    return this.testSmsConfig.execute(dto);
  }

  // ── Email Provider Settings (email-provider) ───────────────────────────────

  @ApiOperation({ summary: 'Get email provider configuration (owner-scoped)' })
  @ApiOkResponse({ description: 'OrganizationEmailConfig view (no secrets)' })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Get('settings/email')
  getEmailConfigEndpoint() {
    return this.getOrgEmailConfig.execute();
  }

  @ApiOperation({ summary: 'Upsert email provider configuration' })
  @ApiOkResponse({ description: 'Updated OrganizationEmailConfig view' })
  @HttpCode(HttpStatus.OK)
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Post('settings/email')
  upsertEmailConfigEndpoint(@Body() dto: UpsertOrgEmailConfigDto) {
    return this.upsertOrgEmailConfig.execute(dto);
  }

  @ApiOperation({ summary: 'Send a test email via the configured provider' })
  @ApiOkResponse({ description: 'Test result' })
  @HttpCode(HttpStatus.OK)
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Post('settings/email/test')
  testEmailConfigEndpoint(@Body() dto: TestEmailConfigDto) {
    return this.testEmailConfig.execute(dto);
  }

  @ApiOperation({ summary: 'List the 50 most recent SMS deliveries' })
  @ApiOkResponse({ description: 'Recent SmsDelivery rows (owner-scoped)' })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @Get('settings/sms/deliveries')
  async listSmsDeliveriesEndpoint() {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const rows = await this.prisma.smsDelivery.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        provider: true,
        toPhone: true,
        status: true,
        providerMessageId: true,
        errorMessage: true,
        sentAt: true,
        deliveredAt: true,
        createdAt: true,
      },
    });
    return { items: rows };
  }

  // ── Contact Messages ───────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List contact messages' })
  @ApiOkResponse({ description: 'Paginated contact messages' })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @Get('contact-messages')
  listContactMessagesEndpoint(@Query() query: ListContactMessagesDto) {
    return this.listContactMessages.execute({
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @ApiOperation({ summary: 'Update contact message status' })
  @ApiParam({ name: 'id', description: 'Contact message UUID' })
  @ApiOkResponse({ description: 'Updated message' })
  @CheckPermissions({ action: 'update', subject: 'Setting' })
  @Patch('contact-messages/:id/status')
  updateContactMessageStatusEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactMessageStatusDto,
  ) {
    return this.updateContactMessageStatus.execute({ id, status: dto.status });
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List notifications for the current staff user' })
  @ApiOkResponse({ description: 'Paginated notification list' })
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @Get('notifications')
  listNotificationsEndpoint(
    @CurrentUser() user: JwtUser,
    @Query() query: ListNotificationsDto,
  ) {
    return this.listNotifications.execute({
      organizationId: this.tenant.requireOrganizationIdOrDefault(),
      recipientId: user.sub,
      unreadOnly: query.unreadOnly,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @ApiOperation({ summary: 'Get unread notification count for the current staff user' })
  @ApiOkResponse({ description: 'Unread count value' })
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @Get('notifications/unread-count')
  getUnreadCountEndpoint(
    @CurrentUser() user: JwtUser,
  ) {
    return this.getUnreadCount.execute({
      organizationId: this.tenant.requireOrganizationIdOrDefault(),
      recipientId: user.sub,
    });
  }

  @ApiOperation({ summary: 'Mark notifications as read (all or a single one)' })
  @ApiNoContentResponse({ description: 'Notifications marked as read' })
  @CheckPermissions({ action: 'update', subject: 'Booking' })
  @Patch('notifications/mark-read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markReadEndpoint(
    @CurrentUser() user: JwtUser,
    @Body() body: MarkReadDto = {},
  ) {
    return this.markRead.execute({
      organizationId: this.tenant.requireOrganizationIdOrDefault(),
      recipientId: user.sub,
      ...body,
    });
  }

  // ── Email Templates ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List email templates' })
  @ApiOkResponse({ description: 'Paginated email template list' })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @Get('email-templates')
  @RequireFeature(FeatureKey.EMAIL_TEMPLATES)
  listEmailTemplatesEndpoint(
    @Query() query: ListEmailTemplatesDto,
  ) {
    return this.listEmailTemplates.execute({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @ApiOperation({ summary: 'Create an email template' })
  @ApiCreatedResponse({ description: 'Email template created' })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Post('email-templates')
  @HttpCode(HttpStatus.CREATED)
  @RequireFeature(FeatureKey.EMAIL_TEMPLATES)
  createEmailTemplateEndpoint(
    @Body() body: CreateEmailTemplateDto,
  ) {
    return this.createEmailTemplate.execute({ ...body });
  }

  @ApiOperation({ summary: 'Get a single email template by ID' })
  @ApiOkResponse({ description: 'Email template details' })
  @ApiParam({ name: 'id', description: 'Email template UUID', example: '00000000-0000-0000-0000-000000000000' })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @Get('email-templates/:id')
  @RequireFeature(FeatureKey.EMAIL_TEMPLATES)
  getEmailTemplateEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.getEmailTemplate.execute({ id });
  }

  @ApiOperation({ summary: 'Preview a rendered email template' })
  @ApiOkResponse({ description: 'Rendered HTML preview' })
  @ApiParam({ name: 'id', description: 'Email template UUID', example: '00000000-0000-0000-0000-000000000000' })
  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @Post('email-templates/:id/preview')
  @HttpCode(HttpStatus.OK)
  @RequireFeature(FeatureKey.EMAIL_TEMPLATES)
  previewEmailTemplateEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PreviewEmailTemplateDto,
  ) {
    return this.previewEmailTemplate.execute({
      id,
      context: body.context ?? {},
    });
  }

  @ApiOperation({ summary: 'Update an email template' })
  @ApiOkResponse({ description: 'Updated email template' })
  @ApiParam({ name: 'id', description: 'Email template UUID', example: '00000000-0000-0000-0000-000000000000' })
  @CheckPermissions({ action: 'manage', subject: 'Setting' })
  @Patch('email-templates/:id')
  @RequireFeature(FeatureKey.EMAIL_TEMPLATES)
  updateEmailTemplateEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEmailTemplateDto,
  ) {
    return this.updateEmailTemplate.execute({ id, ...body });
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List chat conversations' })
  @ApiOkResponse({ description: 'Paginated conversation list' })
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @Get('chat/conversations')
  listConversationsEndpoint(
    @Query() query: ListConversationsDto,
  ) {
    return this.listConversations.execute({
      clientId: query.clientId,
      employeeId: query.employeeId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @ApiOperation({ summary: 'List messages in a conversation' })
  @ApiOkResponse({ description: 'Cursor-paginated message list' })
  @ApiParam({ name: 'id', description: 'Conversation UUID', example: '00000000-0000-0000-0000-000000000000' })
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @Get('chat/conversations/:id/messages')
  listMessagesEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesDto,
  ) {
    return this.listMessages.execute({
      conversationId: id,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
  }

  @ApiOperation({ summary: 'Get a single conversation by ID' })
  @ApiOkResponse({ description: 'Conversation details' })
  @ApiParam({ name: 'id', description: 'Conversation UUID', example: '00000000-0000-0000-0000-000000000000' })
  @CheckPermissions({ action: 'read', subject: 'Booking' })
  @Get('chat/conversations/:id')
  getConversationEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.getConversation.execute({ conversationId: id });
  }

  @ApiOperation({ summary: 'Close a conversation' })
  @ApiOkResponse({ description: 'Conversation closed' })
  @ApiParam({ name: 'id', description: 'Conversation UUID', example: '00000000-0000-0000-0000-000000000000' })
  @CheckPermissions({ action: 'update', subject: 'Booking' })
  @Patch('chat/conversations/:id/close')
  @HttpCode(HttpStatus.OK)
  closeConversationEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.closeConversation.execute({ conversationId: id });
  }

  @ApiOperation({ summary: 'Send a staff message in a conversation' })
  @ApiCreatedResponse({ description: 'Message sent' })
  @ApiParam({ name: 'id', description: 'Conversation UUID', example: '00000000-0000-0000-0000-000000000000' })
  @CheckPermissions({ action: 'update', subject: 'Booking' })
  @Post('chat/conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendStaffMessageEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendStaffMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.sendStaffMessage.execute({
      conversationId: id,
      staffId: user.sub,
      body: body.body,
    });
  }

  @CheckPermissions({ action: 'read', subject: 'Setting' })
  @Get('delivery-logs')
  @ApiOperation({ summary: 'List email delivery logs for this organization' })
  @ApiOkResponse({ description: 'Paginated delivery log' })
  async listDeliveryLogs(
    @Query() dto: ListTenantDeliveryLogsDto,
  ): Promise<unknown> {
    return this.listTenantDeliveryLogs.execute(dto);
  }

  @CheckPermissions({ action: 'read', subject: 'Billing' })
  @Get('email-fallback-quota')
  @ApiOperation({ summary: 'Get platform email fallback quota usage for this billing period' })
  @ApiOkResponse({ description: 'Current usage vs plan limit for email_fallback_monthly' })
  async getEmailFallbackQuota(): Promise<{ used: number; limit: number; periodStart: string }> {
    const orgId = this.tenant.requireOrganizationIdOrDefault();
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const cached = await this.subscriptionCache.get(orgId).catch(() => null);
    const limit = cached
      ? ((cached.limits['email_fallback_monthly'] as number | undefined) ?? -1)
      : -1;

    const used =
      (await this.usageCounter.read(orgId, FeatureKey.EMAIL_FALLBACK_MONTHLY, periodStart)) ?? 0;

    return { used, limit, periodStart: periodStart.toISOString() };
  }
}
