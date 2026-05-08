import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AdminHostGuard, JwtGuard, SuperAdminGuard } from '../../common/guards';
import { SuperAdminContextInterceptor } from '../../common/interceptors';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ApiStandardResponses } from '../../common/swagger';
import { ListPlansAdminHandler } from '../../modules/platform/admin/list-plans/list-plans-admin.handler';
import { CreatePlanHandler } from '../../modules/platform/admin/create-plan/create-plan.handler';
import { UpdatePlanHandler } from '../../modules/platform/admin/update-plan/update-plan.handler';
import { DeletePlanHandler } from '../../modules/platform/admin/delete-plan/delete-plan.handler';
import { CreatePlanDto, UpdatePlanDto, DeletePlanDto } from './dto/plan.dto';
import { PlanResponseDto, PlanWithCountDto } from './dto/admin-response.dto';

@ApiTags('Admin / Plans')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/plans')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class AdminPlansController {
  constructor(
    private readonly listHandler: ListPlansAdminHandler,
    private readonly createHandler: CreatePlanHandler,
    private readonly updateHandler: UpdatePlanHandler,
    private readonly deleteHandler: DeletePlanHandler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all plans (admin view, includes inactive)' })
  @ApiOkResponse({ description: 'Paginated list of plans' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'perPage', required: false, type: Number, example: 20, description: 'Items per page (default 20, max 100)' })
  list(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.listHandler.execute({
      page: page !== undefined ? Number(page) : undefined,
      perPage: perPage !== undefined ? Number(perPage) : undefined,
    });
  }

  @Post()
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a billing plan' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  create(
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    const { reason, ...data } = dto;
    return this.createHandler.execute({
      superAdminUserId: user.id,
      reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
      data,
    });
  }

  @Patch(':id')
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update a billing plan' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiParam({ name: 'id', description: 'Plan UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    const { reason, ...data } = dto;
    return this.updateHandler.execute({
      planId: id,
      superAdminUserId: user.id,
      reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
      data,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Soft-delete a billing plan (sets isActive=false)' })
  @ApiNoContentResponse({ description: 'Plan deleted' })
  @ApiParam({ name: 'id', description: 'Plan UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  async remove(
    @Param('id') id: string,
    @Body() dto: DeletePlanDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.deleteHandler.execute({
      planId: id,
      superAdminUserId: user.id,
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }
}
