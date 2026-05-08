import { Body, Controller, Get, HttpCode, HttpStatus, Put, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ApiStandardResponses } from '../../common/swagger';
import { AdminHostGuard } from '../../common/guards/admin-host.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { SuperAdminContextInterceptor } from '../../common/interceptors/super-admin-context.interceptor';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { PlatformSettingsService } from '../../modules/platform/settings/platform-settings.service';
import { SecuritySettingsDto, UpdateSecuritySettingsDto } from './dto/security-settings.dto';
import { LogPlatformSettingUpdateHandler } from '../../modules/platform/admin/log-platform-setting-update/log-platform-setting-update.handler';

@ApiTags('Admin / Security Settings')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/settings/security')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class SecuritySettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly logHandler: LogPlatformSettingUpdateHandler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get platform security settings' })
  @ApiOkResponse({ type: SecuritySettingsDto })
  async getSettings(): Promise<SecuritySettingsDto> {
    const [ttl, require2fa, ipAllowlist] = await Promise.all([
      this.settings.get<number>('security.session.superAdminTtlMinutes'),
      this.settings.get<boolean>('security.twoFactor.required'),
      this.settings.get<string[]>('security.ipAllowlist'),
    ]);
    return {
      sessionTtlMinutes: ttl ?? 60,
      require2fa: require2fa ?? false,
      ipAllowlist: ipAllowlist ?? [],
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update platform security settings' })
  @ApiOkResponse({ type: SecuritySettingsDto })
  async updateSettings(
    @Body() body: UpdateSecuritySettingsDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const updates: Array<[string, unknown]> = [];
    if (body.sessionTtlMinutes !== undefined) updates.push(['security.session.superAdminTtlMinutes', body.sessionTtlMinutes]);
    if (body.require2fa !== undefined) updates.push(['security.twoFactor.required', body.require2fa]);
    if (body.ipAllowlist !== undefined) updates.push(['security.ipAllowlist', body.ipAllowlist]);

    // Order: set then log. If logHandler.execute throws, the setting is written but
    // unaudited for that key — preferred over logging an unwritten change. Per-key
    // partial failures are surfaced via thrown error; loop does not swallow.
    for (const [key, nextValue] of updates) {
      const previousValue = await this.settings.get(key);
      if (this.valuesEqual(previousValue, nextValue)) continue;
      await this.settings.set(key, nextValue, user.sub);
      await this.logHandler.execute({
        superAdminUserId: user.sub,
        settingKey: key,
        previousValue,
        nextValue,
        ipAddress,
        userAgent,
      });
    }
    return { updated: true };
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
}
