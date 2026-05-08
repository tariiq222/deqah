import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { SearchUsersHandler } from '../../modules/platform/admin/search-users/search-users.handler';
import { ResetUserPasswordHandler } from '../../modules/platform/admin/reset-user-password/reset-user-password.handler';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { AdminUserListResponseDto } from './dto/admin-response.dto';

@ApiTags('Admin / Users')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/users')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class AdminUsersController {
  constructor(
    private readonly searchHandler: SearchUsersHandler,
    private readonly resetHandler: ResetUserPasswordHandler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search users across all tenants' })
  @ApiOkResponse({ type: AdminUserListResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by email or name' })
  @ApiQuery({ name: 'organizationId', required: false, type: String, description: 'Filter by organization UUID' })
  search(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.searchHandler.execute({
      page: Math.max(1, Number(page ?? 1)),
      perPage: Math.min(Math.max(1, Number(perPage ?? 20)), 100),
      search: search?.trim() ? search.trim() : undefined,
      organizationId: organizationId?.trim() ? organizationId.trim() : undefined,
    });
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Issue a temporary password for a user' })
  @ApiNoContentResponse({ description: 'Password reset email sent' })
  @ApiParam({ name: 'id', description: 'User UUID', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  async resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() user: { sub: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.resetHandler.execute({
      targetUserId: id,
      superAdminUserId: user.sub,
      reason: dto.reason,
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }
}
