import { Body, Controller, Get, Put, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AdminHostGuard } from '../../common/guards/admin-host.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { SuperAdminContextInterceptor } from '../../common/interceptors/super-admin-context.interceptor';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { ApiStandardResponses } from '../../common/swagger';
import { GetNotificationDefaultsHandler } from '../../modules/platform/notifications-config/get-notification-defaults.handler';
import { UpdateNotificationDefaultsHandler } from '../../modules/platform/notifications-config/update-notification-defaults.handler';
import { UpdateNotificationDefaultsDto } from '../../modules/platform/notifications-config/update-notification-defaults.dto';

@ApiTags('Admin / Notifications Config')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/notifications-config')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class AdminNotificationsConfigController {
  constructor(
    private readonly getHandler: GetNotificationDefaultsHandler,
    private readonly updateHandler: UpdateNotificationDefaultsHandler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get platform notification defaults' })
  @ApiOkResponse({ schema: { type: 'object', description: 'Notification default settings object' } })
  getDefaults() {
    return this.getHandler.execute();
  }

  @Put()
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update platform notification defaults' })
  @ApiOkResponse({ schema: { type: 'object', description: 'Updated notification defaults' } })
  updateDefaults(
    @Body() dto: UpdateNotificationDefaultsDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    return this.updateHandler.execute({
      dto,
      superAdminUserId: user.sub,
      ipAddress,
      userAgent,
    });
  }
}
