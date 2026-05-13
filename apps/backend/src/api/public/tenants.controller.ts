import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import { ApiPublicResponses, ApiErrorDto } from '../../common/swagger';
import { Public } from '../../common/guards/jwt.guard';
import { RegisterTenantDto } from '../../modules/platform/tenant-registration/register-tenant.dto';
import { RegisterTenantHandler } from '../../modules/platform/tenant-registration/register-tenant.handler';
import { CheckTenantExistsHandler, type CheckTenantExistsResult } from '../../modules/platform/tenant-registration/check-tenant-exists/check-tenant-exists.handler';
import { GetCurrentUserHandler } from '../../modules/identity/get-current-user/get-current-user.handler';
import { flattenPermissions } from '../../modules/identity/casl/flatten-permissions';

@ApiTags('Public / Tenants')
@ApiPublicResponses()
@Controller('tenants')
export class PublicTenantsController {
  constructor(
    private readonly registerTenant: RegisterTenantHandler,
    private readonly checkTenantExists: CheckTenantExistsHandler,
    private readonly getCurrentUser: GetCurrentUserHandler,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('exists')
  @ApiOperation({ summary: 'Check tenant existence by subdomain (public)' })
  @ApiOkResponse({ description: 'Tenant existence result' })
  async existsEndpoint(
    @Headers('x-forwarded-host') xfh: string | undefined,
    @Headers('host') host: string | undefined,
    @Headers('x-deqah-tenant-host') tenantHost: string | undefined,
  ): Promise<CheckTenantExistsResult> {
    return this.checkTenantExists.execute(tenantHost ?? xfh ?? host);
  }

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new tenant organization with a 14-day free trial' })
  @ApiCreatedResponse({ description: 'Organization created; returns access + refresh tokens with user payload' })
  @ApiResponse({ status: 409, description: 'Email already registered', type: ApiErrorDto })
  async registerEndpoint(
    @Body() dto: RegisterTenantDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.registerTenant.execute(dto);
    const user = await this.getCurrentUser.execute({ userId: tokens.userId });

    this.setRefreshCookie(res, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: this.parseTtlSeconds(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'),
      user: { ...user, permissions: flattenPermissions(user) },
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    const ttlMs =
      this.parseTtlSeconds(this.config.get<string>('JWT_REFRESH_TTL') ?? '30d') * 1000;
    res.cookie('ck_refresh', token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ttlMs,
    });
  }

  private parseTtlSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900;
    const n = parseInt(match[1], 10);
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return n * multipliers[match[2]];
  }
}
