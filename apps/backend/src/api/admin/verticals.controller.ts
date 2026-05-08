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
import { ListVerticalsAdminHandler } from '../../modules/platform/admin/list-verticals/list-verticals-admin.handler';
import { CreateVerticalAdminHandler } from '../../modules/platform/admin/create-vertical/create-vertical-admin.handler';
import { UpdateVerticalAdminHandler } from '../../modules/platform/admin/update-vertical/update-vertical-admin.handler';
import { DeleteVerticalAdminHandler } from '../../modules/platform/admin/delete-vertical/delete-vertical-admin.handler';
import {
  CreateVerticalDto,
  UpdateVerticalDto,
  DeleteVerticalDto,
} from './dto/vertical.dto';
import { VerticalListResponseDto, VerticalResponseDto } from './dto/admin-response.dto';

@ApiTags('Admin / Verticals')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/verticals')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class AdminVerticalsController {
  constructor(
    private readonly listHandler: ListVerticalsAdminHandler,
    private readonly createHandler: CreateVerticalAdminHandler,
    private readonly updateHandler: UpdateVerticalAdminHandler,
    private readonly deleteHandler: DeleteVerticalAdminHandler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all verticals (admin view, includes inactive)' })
  @ApiOkResponse({ type: VerticalListResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, description: 'Items per page, max 100 (default: 20)', example: 20 })
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
  @ApiOperation({ summary: 'Create a vertical' })
  @ApiCreatedResponse({ type: VerticalResponseDto })
  create(
    @Body() dto: CreateVerticalDto,
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
  @ApiOperation({ summary: 'Update a vertical' })
  @ApiOkResponse({ type: VerticalResponseDto })
  @ApiParam({ name: 'id', description: 'Vertical UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVerticalDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    const { reason, ...data } = dto;
    return this.updateHandler.execute({
      verticalId: id,
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
  @ApiOperation({ summary: 'Soft-delete a vertical' })
  @ApiNoContentResponse({ description: 'Vertical deleted' })
  @ApiParam({ name: 'id', description: 'Vertical UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  async remove(
    @Param('id') id: string,
    @Body() dto: DeleteVerticalDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.deleteHandler.execute({
      verticalId: id,
      superAdminUserId: user.id,
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }
}
