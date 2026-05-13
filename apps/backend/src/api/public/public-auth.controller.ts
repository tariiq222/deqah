import { Controller, Post, Body, HttpCode, HttpStatus, Req, Ip, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse } from '@nestjs/swagger';
import { Public } from '../../common/guards/jwt.guard';
import { ApiPublicResponses } from '../../common/swagger';
import { ClientSessionGuard } from '../../common/guards/client-session.guard';
import { ClientSession } from '../../common/auth/client-session.decorator';
import { RegisterHandler } from '../../modules/identity/client-auth/register.handler';
import { RegisterDto } from '../../modules/identity/client-auth/register.dto';
import { ClientLoginHandler } from '../../modules/identity/client-auth/client-login.handler';
import { ClientLoginDto } from '../../modules/identity/client-auth/client-login.dto';
import { ClientRefreshHandler } from '../../modules/identity/client-auth/client-refresh.handler';
import { ClientLogoutHandler } from '../../modules/identity/client-auth/client-logout.handler';
import { RefreshTokenDto, LogoutDto } from '../../modules/identity/client-auth/client-tokens.dto';
import { ResetPasswordHandler } from '../../modules/identity/client-auth/reset-password/reset-password.handler';
import { ResetPasswordDto } from '../../modules/identity/client-auth/reset-password/reset-password.dto';
import { Request } from 'express';


@ApiTags('Public / Auth')
@ApiPublicResponses()
@Controller('public/auth')
export class PublicAuthController {
  constructor(
    private readonly register: RegisterHandler,
    private readonly login: ClientLoginHandler,
    private readonly refresh: ClientRefreshHandler,
    private readonly logout: ClientLogoutHandler,
    private readonly resetPassword: ResetPasswordHandler,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a new client account' })
  @ApiCreatedResponse({ schema: { type: 'object', description: 'Created client account with tokens' } })
  async registerEndpoint(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.register.execute(dto, req);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with phone and password' })
  @ApiOkResponse({ schema: { type: 'object', description: 'Auth tokens' } })
  async loginEndpoint(@Body() dto: ClientLoginDto, @Ip() ip: string) {
    return this.login.execute(dto, ip);
  }

  @UseGuards(ClientSessionGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({ schema: { type: 'object', description: 'New access token' } })
  async refreshEndpoint(
    @Body() dto: RefreshTokenDto,
    @ClientSession() session: { id: string },
  ) {
    return this.refresh.execute(dto.refreshToken, session.id);
  }

  @UseGuards(ClientSessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Log out and revoke refresh token' })
  @ApiNoContentResponse()
  async logoutEndpoint(
    @Body() dto: LogoutDto,
    @ClientSession() session: { id: string },
  ) {
    await this.logout.execute(dto.refreshToken, session.id);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with OTP token' })
  @ApiNoContentResponse()
  async resetPasswordEndpoint(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.resetPassword.execute(dto);
  }
}
