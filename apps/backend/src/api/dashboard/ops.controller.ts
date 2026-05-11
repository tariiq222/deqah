import {
  Controller, Get, Post, Body, Query,
  UseGuards, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiOkResponse, ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReportFormat } from '@prisma/client';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { ApiStandardResponses } from '../../common/swagger';
import { TenantContextService } from '../../common/tenant';
import { RequireFeature } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { GenerateReportHandler } from '../../modules/ops/generate-report/generate-report.handler';
import { GenerateReportDto } from '../../modules/ops/generate-report/generate-report.dto';
import { ListActivityHandler } from '../../modules/ops/log-activity/list-activity.handler';
import { ListActivityDto } from '../../modules/ops/log-activity/list-activity.dto';

@ApiTags('Dashboard / Ops')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('dashboard/ops')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardOpsController {
  constructor(
    private readonly generateReport: GenerateReportHandler,
    private readonly listActivity: ListActivityHandler,
    private readonly tenant: TenantContextService,
  ) {}

  @Post('reports')
  @RequireFeature(FeatureKey.ADVANCED_REPORTS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a clinic report' })
  @ApiOkResponse({
    description:
      'JSON report object, or an xlsx binary when format is EXCEL ' +
      '(Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)',
    content: {
      'application/json': { schema: { type: 'object' } },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @CheckPermissions({ action: 'manage', subject: 'Report' })
  async generateReportEndpoint(
    @Body() body: GenerateReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.generateReport.execute(body);

    if (result.format === ReportFormat.EXCEL && result.excelBuffer) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="report-${result.reportId}.xlsx"`);
      res.send(result.excelBuffer);
      return;
    }

    return result;
  }

  @Get('activity')
  @RequireFeature(FeatureKey.ACTIVITY_LOG)
  @ApiOperation({ summary: 'List activity log entries' })
  @ApiOkResponse({
    description: 'Paginated list of activity log entries',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, action: { type: 'string' }, entity: { type: 'string' }, entityId: { type: 'string', format: 'uuid', nullable: true }, userId: { type: 'string', format: 'uuid', nullable: true }, createdAt: { type: 'string', format: 'date-time' } } } },
        total: { type: 'number' },
        page: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  @CheckPermissions({ action: 'read', subject: 'Report' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by staff user UUID' })
  @ApiQuery({ name: 'entity', required: false, description: 'Filter by entity type (e.g. Booking, Client)' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Filter by entity UUID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action type (ActivityAction enum)' })
  @ApiQuery({ name: 'from', required: false, description: 'Start of date range (ISO 8601)' })
  @ApiQuery({ name: 'to', required: false, description: 'End of date range (ISO 8601)' })
  listActivityEndpoint(@Query() query: ListActivityDto) {
    return this.listActivity.execute({
      ...query,
      organizationId: this.tenant.requireOrganizationId(),
    });
  }
}
