import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { StartImpersonationHandler } from '../../modules/platform/admin/start-impersonation/start-impersonation.handler';
import { EndImpersonationHandler } from '../../modules/platform/admin/end-impersonation/end-impersonation.handler';
import { ListImpersonationSessionsHandler } from '../../modules/platform/admin/list-impersonation-sessions/list-impersonation-sessions.handler';
import { StartImpersonationDto } from './dto/impersonation.dto';
import {
  ImpersonationSessionListResponseDto,
  ImpersonationStartResultDto,
} from './dto/admin-response.dto';

@ApiTags('Admin / Impersonation')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/impersonation')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class AdminImpersonationController {
  constructor(
    private readonly startHandler: StartImpersonationHandler,
    private readonly endHandler: EndImpersonationHandler,
    private readonly listHandler: ListImpersonationSessionsHandler,
  ) {}

  @Post()
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start an impersonation session (15-min shadow JWT)' })
  @ApiCreatedResponse({ type: ImpersonationStartResultDto })
  start(
    @Body() dto: StartImpersonationDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ) {
    return this.startHandler.execute({
      superAdminUserId: user.sub,
      organizationId: dto.organizationId,
      targetUserId: dto.targetUserId,
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'End an active impersonation session manually' })
  @ApiNoContentResponse({ description: 'Impersonation session ended' })
  @ApiParam({ name: 'id', description: 'Impersonation session UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  async end(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.endHandler.execute({
      sessionId: id,
      superAdminUserId: user.sub,
      endedReason: 'manual',
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List impersonation sessions (active + historical)' })
  @ApiOkResponse({ type: ImpersonationSessionListResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'true = active only, false = ended only' })
  @ApiQuery({ name: 'superAdminUserId', required: false, type: String, description: 'Filter by super-admin user UUID' })
  @ApiQuery({ name: 'organizationId', required: false, type: String, description: 'Filter by organization UUID' })
  list(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('active') active?: string,
    @Query('superAdminUserId') superAdminUserId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const parsedActive =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.listHandler.execute({
      page: Math.max(1, Number(page ?? 1)),
      perPage: Math.min(Math.max(1, Number(perPage ?? 50)), 200),
      active: parsedActive,
      superAdminUserId: superAdminUserId?.trim() || undefined,
      organizationId: organizationId?.trim() || undefined,
    });
  }
}
