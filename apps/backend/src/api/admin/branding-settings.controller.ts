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
import { UpdatePlatformBrandDto } from './dto/update-platform-brand.dto';
import { LogPlatformSettingUpdateHandler } from '../../modules/platform/admin/log-platform-setting-update/log-platform-setting-update.handler';

@ApiTags('Admin / Branding Settings')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('admin/settings/brand')
@UseGuards(AdminHostGuard, JwtGuard, SuperAdminGuard)
@UseInterceptors(SuperAdminContextInterceptor)
export class BrandingSettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly logHandler: LogPlatformSettingUpdateHandler,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get platform branding configuration' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        logoUrl: { type: 'string', nullable: true },
        primaryColor: { type: 'string', nullable: true },
        accentColor: { type: 'string', nullable: true },
        defaultLocale: { type: 'string' },
        supportedLocales: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getBrand() {
    const [logoUrl, primaryColor, accentColor, locale, rtlDefault, dateFormat, currencyFormat] = await Promise.all([
      this.settings.get<string>('platform.brand.logoUrl'),
      this.settings.get<string>('platform.brand.primaryColor'),
      this.settings.get<string>('platform.brand.accentColor'),
      this.settings.get<string>('platform.locale.default'),
      this.settings.get<boolean>('platform.locale.rtlDefault'),
      this.settings.get<string>('platform.locale.dateFormat'),
      this.settings.get<string>('platform.locale.currencyFormat'),
    ]);
    return {
      logoUrl: logoUrl ?? '',
      primaryColor: primaryColor ?? '#354FD8',
      accentColor: accentColor ?? '#82CC17',
      locale: {
        default: locale ?? 'ar',
        rtlDefault: rtlDefault ?? true,
        dateFormat: dateFormat ?? 'dd/MM/yyyy',
        currencyFormat: currencyFormat ?? 'SAR',
      },
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Throttle({ 'admin-mutation': { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Update platform branding configuration' })
  @ApiOkResponse({ schema: { type: 'object', properties: { updated: { type: 'boolean' } } } })
  async updateBrand(
    @Body() body: UpdatePlatformBrandDto,
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const updates: Array<[string, unknown]> = [];
    if ('logoUrl' in body) updates.push(['platform.brand.logoUrl', body.logoUrl]);
    if ('primaryColor' in body) updates.push(['platform.brand.primaryColor', body.primaryColor]);
    if ('accentColor' in body) updates.push(['platform.brand.accentColor', body.accentColor]);
    if (body.locale && typeof body.locale === 'object') {
      const loc = body.locale;
      if ('default' in loc) updates.push(['platform.locale.default', loc.default]);
      if ('rtlDefault' in loc) updates.push(['platform.locale.rtlDefault', loc.rtlDefault]);
      if ('dateFormat' in loc) updates.push(['platform.locale.dateFormat', loc.dateFormat]);
      if ('currencyFormat' in loc) updates.push(['platform.locale.currencyFormat', loc.currencyFormat]);
    }

    // Order: set then log. If logHandler.execute throws, the setting is written but
    // unaudited for that key — preferred over logging an unwritten change. Per-key
    // partial failures are surfaced via thrown error; loop does not swallow.
    for (const [key, nextValue] of updates) {
      const previousValue = await this.settings.get(key);
      if (previousValue === nextValue) continue;
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
}
