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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AdminHostGuard } from '../../common/guards/admin-host.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { SuperAdminContextInterceptor } from '../../common/interceptors/super-admin-context.interceptor';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { ApiStandardResponses } from '../../common/swagger';
import { ListPlatformEmailTemplatesHandler } from '../../modules/platform/email/list-platform-email-templates/list-platform-email-templates.handler';
import { GetPlatformEmailTemplateHandler } from '../../modules/platform/email/get-platform-email-template/get-platform-email-template.handler';
import { UpdatePlatformEmailTemplateHandler } from '../../modules/platform/email/update-platform-email-template/update-platform-email-template.handler';
import { UpdatePlatformEmailTemplateDto } from '../../modules/platform/email/update-platform-email-template/update-platform-email-template.dto';
import { PreviewPlatformEmailTemplateHandler } from '../../modules/platform/email/preview-platform-email-template/preview-platform-email-template.handler';
import { SendTestEmailHandler } from '../../modules/platform/email/send-test-email/send-test-email.handler';
import { SendTestEmailDto } from '../../modules/platform/email/send-test-email/send-test-email.dto';
import { ListPlatformEmailLogsHandler, ListPlatformEmailLogsQuery, PlatformEmailLogStatus } from '../../modules/platform/email/list-platform-email-logs/list-platform-email-logs.handler';
import { PreviewEmailTemplateDto } from './dto/preview-email-template.dto';
import {
  EmailPreviewDto,
  PlatformEmailLogsResponseDto,
  PlatformEmailTemplateDetailDto,
  PlatformEmailTemplateListItemDto,
} from './dto/admin-response.dto';

@ApiTags('Admin / Platform Email')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/platform-email')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class PlatformEmailController {
  constructor(
    private readonly listTemplates: ListPlatformEmailTemplatesHandler,
    private readonly getTemplate: GetPlatformEmailTemplateHandler,
    private readonly updateTemplate: UpdatePlatformEmailTemplateHandler,
    private readonly previewTemplate: PreviewPlatformEmailTemplateHandler,
    private readonly sendTest: SendTestEmailHandler,
    private readonly listLogs: ListPlatformEmailLogsHandler,
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'List all platform email templates' })
  @ApiOkResponse({ type: [PlatformEmailTemplateListItemDto] })
  list() {
    return this.listTemplates.execute();
  }

  @Get('templates/:slug')
  @ApiOperation({ summary: 'Get a platform email template by slug' })
  @ApiOkResponse({ type: PlatformEmailTemplateDetailDto })
  @ApiParam({ name: 'slug', description: 'Template slug', example: 'tenant-welcome' })
  get(@Param('slug') slug: string) {
    return this.getTemplate.execute(slug);
  }

  @Patch('templates/:slug')
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update a platform email template' })
  @ApiOkResponse({ type: PlatformEmailTemplateDetailDto })
  @ApiParam({ name: 'slug', description: 'Template slug', example: 'tenant-welcome' })
  update(
    @Param('slug') slug: string,
    @Body() dto: UpdatePlatformEmailTemplateDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    return this.updateTemplate.execute({
      slug,
      dto,
      superAdminUserId: user.sub,
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });
  }

  @Post('templates/:slug/preview')
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Preview a platform email template with interpolated vars' })
  @ApiCreatedResponse({ type: EmailPreviewDto })
  @ApiParam({ name: 'slug', description: 'Template slug', example: 'tenant-welcome' })
  preview(
    @Param('slug') slug: string,
    @Body() body: PreviewEmailTemplateDto,
  ) {
    return this.previewTemplate.execute(slug, body.vars ?? {});
  }

  @Post('test-send')
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a test email from a platform template' })
  @ApiCreatedResponse({ description: 'Test email dispatched', schema: { type: 'object', properties: { ok: { type: 'boolean' }, reason: { type: 'string' } } } })
  testSend(@Body() dto: SendTestEmailDto) {
    return this.sendTest.execute(dto);
  }

  @Get('logs')
  @ApiOperation({ summary: 'List platform email delivery logs (cursor-based pagination)' })
  @ApiOkResponse({ type: PlatformEmailLogsResponseDto })
  @ApiQuery({ name: 'status', required: false, enum: ['QUEUED', 'SENT', 'FAILED', 'SKIPPED_NOT_CONFIGURED'], description: 'Filter by delivery status' })
  @ApiQuery({ name: 'templateSlug', required: false, type: String, description: 'Filter by template slug' })
  @ApiQuery({ name: 'organizationId', required: false, type: String, description: 'Filter by organization UUID' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Pagination cursor (UUID of last seen record)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50, description: 'Max records to return (default: 50, max: 200)' })
  logs(
    @Query('status') status?: PlatformEmailLogStatus,
    @Query('templateSlug') templateSlug?: string,
    @Query('organizationId') organizationId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ) {
    const q: ListPlatformEmailLogsQuery = {};
    if (status) q.status = status;
    if (templateSlug) q.templateSlug = templateSlug;
    if (organizationId) q.organizationId = organizationId;
    if (cursor) q.cursor = cursor;
    if (limitStr) q.limit = parseInt(limitStr, 10);
    return this.listLogs.execute(q);
  }
}
