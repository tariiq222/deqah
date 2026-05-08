import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationStatus } from '@prisma/client';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  AdminHostGuard,
  JwtGuard,
  SuperAdminGuard,
} from '../../common/guards';
import { SuperAdminContextInterceptor } from '../../common/interceptors';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ApiStandardResponses } from '../../common/swagger';
import { ListOrganizationsHandler } from '../../modules/platform/admin/list-organizations/list-organizations.handler';
import { GetOrganizationHandler } from '../../modules/platform/admin/get-organization/get-organization.handler';
import { CreateTenantHandler } from '../../modules/platform/admin/create-tenant/create-tenant.handler';
import { UpdateOrganizationHandler } from '../../modules/platform/admin/update-organization/update-organization.handler';
import { ArchiveOrganizationHandler } from '../../modules/platform/admin/archive-organization/archive-organization.handler';
import { SuspendOrganizationHandler } from '../../modules/platform/admin/suspend-organization/suspend-organization.handler';
import { ReinstateOrganizationHandler } from '../../modules/platform/admin/reinstate-organization/reinstate-organization.handler';
import {
  ArchiveOrganizationDto,
  CreateTenantDto,
  UpdateOrganizationDto,
} from './dto/tenant-lifecycle.dto';
import {
  ReinstateOrganizationDto,
  SuspendOrganizationDto,
} from './dto/suspend-organization.dto';
import {
  OrganizationCreatedDto,
  OrganizationDetailDto,
  OrganizationListResponseDto,
  OrganizationUpdatedDto,
} from './dto/admin-response.dto';

// Guard order is load-bearing:
//   1. AdminHostGuard — rejects non-admin Host headers (invariant 2)
//   2. JwtGuard       — validates JWT + rejects ORG_SUSPENDED (invariant 3)
//   3. SuperAdminGuard — re-verifies isSuperAdmin against DB (invariants 1 + 4)
// SuperAdminContextInterceptor runs after guards and unlocks $allTenants
// by setting the CLS flag (invariant 1). It also refuses to run when the
// token carries scope='impersonation'.
@ApiTags('Admin / Organizations')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/organizations')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class AdminOrganizationsController {
  constructor(
    private readonly listHandler: ListOrganizationsHandler,
    private readonly getHandler: GetOrganizationHandler,
    private readonly createTenantHandler: CreateTenantHandler,
    private readonly updateOrganizationHandler: UpdateOrganizationHandler,
    private readonly archiveOrganizationHandler: ArchiveOrganizationHandler,
    private readonly suspendHandler: SuspendOrganizationHandler,
    private readonly reinstateHandler: ReinstateOrganizationHandler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations (cross-tenant)' })
  @ApiOkResponse({ type: OrganizationListResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'suspended', required: false, type: Boolean })
  @ApiQuery({ name: 'status', required: false, enum: OrganizationStatus })
  @ApiQuery({ name: 'verticalId', required: false, type: String, description: 'Filter by vertical UUID' })
  @ApiQuery({ name: 'planId', required: false, type: String, description: 'Filter by plan UUID' })
  list(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
    @Query('suspended') suspended?: string,
    @Query('status') status?: string,
    @Query('verticalId') verticalId?: string,
    @Query('planId') planId?: string,
  ) {
    const parsedSuspended =
      suspended === 'true' ? true : suspended === 'false' ? false : undefined;
    return this.listHandler.execute({
      page: Math.max(1, Number(page ?? 1)),
      perPage: Math.min(Math.max(1, Number(perPage ?? 20)), 100),
      search: search?.trim() ? search.trim() : undefined,
      suspended: parsedSuspended,
      status: parseOrganizationStatus(status),
      verticalId: verticalId?.trim() ? verticalId.trim() : undefined,
      planId: planId?.trim() ? planId.trim() : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization detail with stats' })
  @ApiOkResponse({ type: OrganizationDetailDto })
  @ApiParam({ name: 'id', description: 'Organization UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  show(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.getHandler.execute({ id });
  }

  @Post()
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create tenant organization and owner membership' })
  @ApiCreatedResponse({ type: OrganizationCreatedDto })
  create(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: { sub?: string; id?: string },
    @Req() req: Request,
  ) {
    return this.createTenantHandler.execute({
      ...dto,
      superAdminUserId: user.sub ?? user.id ?? '',
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Patch(':id')
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update organization tenant metadata' })
  @ApiOkResponse({ type: OrganizationUpdatedDto })
  @ApiParam({ name: 'id', description: 'Organization UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: { sub?: string; id?: string },
    @Req() req: Request,
  ) {
    return this.updateOrganizationHandler.execute({
      organizationId: id,
      ...dto,
      superAdminUserId: user.sub ?? user.id ?? '',
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Archive an organization without deleting tenant data' })
  @ApiNoContentResponse({ description: 'Organization archived' })
  @ApiParam({ name: 'id', description: 'Organization UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  async archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ArchiveOrganizationDto,
    @CurrentUser() user: { sub?: string; id?: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.archiveOrganizationHandler.execute({
      organizationId: id,
      superAdminUserId: user.sub ?? user.id ?? '',
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Suspend an organization (logs audit entry)' })
  @ApiNoContentResponse({ description: 'Organization suspended' })
  @ApiParam({ name: 'id', description: 'Organization UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  async suspend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspendOrganizationDto,
    @CurrentUser() user: { sub?: string; id?: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.suspendHandler.execute({
      organizationId: id,
      superAdminUserId: user.sub ?? user.id ?? '',
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post(':id/reinstate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reinstate a suspended organization' })
  @ApiNoContentResponse({ description: 'Organization reinstated' })
  @ApiParam({ name: 'id', description: 'Organization UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  async reinstate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReinstateOrganizationDto,
    @CurrentUser() user: { sub?: string; id?: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.reinstateHandler.execute({
      organizationId: id,
      superAdminUserId: user.sub ?? user.id ?? '',
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }
}

function parseOrganizationStatus(value?: string): OrganizationStatus | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  return Object.values(OrganizationStatus).find((status) => status === normalized);
}
