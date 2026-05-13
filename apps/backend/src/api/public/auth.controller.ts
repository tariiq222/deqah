import {
  Controller, Post, Get, Patch, Body, HttpCode, HttpStatus, UnauthorizedException, UseGuards,
  Req, Res, Param, UseInterceptors, UploadedFile, Ip,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiNoContentResponse, ApiResponse,
  ApiCreatedResponse, ApiParam,
} from '@nestjs/swagger';
import { LoginHandler } from '../../modules/identity/login/login.handler';
import type { OrgSelectionRequired } from '../../modules/identity/login/login.handler';
import { LogoutHandler } from '../../modules/identity/logout/logout.handler';
import { LoginDto } from '../../modules/identity/login/login.dto';
import { RefreshTokenDto } from '../../modules/identity/refresh-token/refresh-token.dto';
import { LogoutDto } from '../../modules/identity/logout/logout.dto';
import { RequestDashboardOtpHandler } from '../../modules/identity/request-dashboard-otp/request-dashboard-otp.handler';
import { RequestDashboardOtpDto } from '../../modules/identity/request-dashboard-otp/request-dashboard-otp.dto';
import { VerifyDashboardOtpHandler } from '../../modules/identity/verify-dashboard-otp/verify-dashboard-otp.handler';
import { VerifyDashboardOtpDto } from '../../modules/identity/verify-dashboard-otp/verify-dashboard-otp.dto';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../infrastructure/database';
import { TokenService } from '../../modules/identity/shared/token.service';
import { DEFAULT_ORGANIZATION_ID } from '../../common/tenant';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../common/tenant/tenant.constants';
import { UserId } from '../../common/auth/user-id.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { GetCurrentUserHandler } from '../../modules/identity/get-current-user/get-current-user.handler';
import { GetCurrentUserQuery } from '../../modules/identity/get-current-user/get-current-user.query';
import { ChangePasswordHandler } from '../../modules/identity/users/change-password.handler';
import { ListMembershipsHandler } from '../../modules/identity/list-memberships/list-memberships.handler';
import { SwitchOrganizationHandler } from '../../modules/identity/switch-organization/switch-organization.handler';
import { SwitchOrganizationDto } from '../../modules/identity/switch-organization/switch-organization.dto';
import { UpdateMembershipProfileHandler } from '../../modules/identity/update-membership-profile/update-membership-profile.handler';
import { UpdateMembershipProfileDto } from '../../modules/identity/update-membership-profile/update-membership-profile.dto';
import { UploadMembershipAvatarHandler } from '../../modules/identity/update-membership-profile/upload-membership-avatar.handler';
import { InviteUserHandler } from '../../modules/identity/invite-user/invite-user.handler';
import { InviteUserDto } from '../../modules/identity/invite-user/invite-user.dto';
import { AcceptInvitationHandler } from '../../modules/identity/accept-invitation/accept-invitation.handler';
import { AcceptInvitationDto } from '../../modules/identity/accept-invitation/accept-invitation.dto';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { RequestPasswordResetHandler } from '../../modules/identity/user-password-reset/request-password-reset/request-password-reset.handler';
import { RequestPasswordResetDto } from '../../modules/identity/user-password-reset/request-password-reset/request-password-reset.dto';
import { PerformPasswordResetHandler } from '../../modules/identity/user-password-reset/perform-password-reset/perform-password-reset.handler';
import { PerformPasswordResetDto } from '../../modules/identity/user-password-reset/perform-password-reset/perform-password-reset.dto';
import { Public } from '../../common/guards/jwt.guard';
import { AllowDuringSuspension } from '../../common/guards/allow-during-suspension.decorator';
import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ApiPublicResponses, ApiErrorDto } from '../../common/swagger';
import { flattenPermissions } from '../../modules/identity/casl/flatten-permissions';
import { BadRequestException } from '@nestjs/common';
import { PlatformSettingsService } from '../../modules/platform/settings/platform-settings.service';

class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password', example: 'P@ssw0rd123' })
  @IsString() currentPassword!: string;

  @ApiProperty({ description: 'New password (min 8 characters)', example: 'NewP@ss456', format: 'password' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'newPassword must contain at least one uppercase letter' })
  @Matches(/[0-9]/, { message: 'newPassword must contain at least one digit' })
  newPassword!: string;
}

@ApiTags('Public / Auth')
@ApiPublicResponses()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginHandler,
    private readonly logout: LogoutHandler,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly getCurrentUser: GetCurrentUserHandler,
    private readonly changePassword: ChangePasswordHandler,
    private readonly listMemberships: ListMembershipsHandler,
    private readonly switchOrganization: SwitchOrganizationHandler,
    private readonly config: ConfigService,
    private readonly requestPasswordReset: RequestPasswordResetHandler,
    private readonly performPasswordReset: PerformPasswordResetHandler,
    private readonly updateMembershipProfile: UpdateMembershipProfileHandler,
    private readonly uploadMembershipAvatar: UploadMembershipAvatarHandler,
    private readonly inviteUser: InviteUserHandler,
    private readonly acceptInvitation: AcceptInvitationHandler,
    private readonly tenant: TenantContextService,
    private readonly requestDashboardOtp: RequestDashboardOtpHandler,
    private readonly verifyDashboardOtp: VerifyDashboardOtpHandler,
    private readonly cls: ClsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({
    description:
      'One of: (1) access token + user profile — successful login; ' +
      '(2) { requiresOtp: true } — 2FA step required (super-admin only); ' +
      '(3) { requires_org_selection: true, memberships: [...] } — user has multiple active orgs and no hint was supplied.',
    schema: {
      oneOf: [
        {
          type: 'object',
          description: 'Successful login',
          properties: {
            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            expiresIn: { type: 'number', example: 900 },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                name: { type: 'string' },
                phone: { type: 'string', nullable: true },
                gender: { type: 'string', nullable: true },
                avatarUrl: { type: 'string', nullable: true },
                isActive: { type: 'boolean' },
                role: { type: 'string' },
                isSuperAdmin: { type: 'boolean' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                organizationId: { type: 'string', format: 'uuid', nullable: true },
                permissions: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        {
          type: 'object',
          description: 'Org selection required — re-submit with organizationId',
          properties: {
            requires_org_selection: { type: 'boolean', enum: [true] },
            memberships: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  organizationId: { type: 'string', format: 'uuid' },
                  organizationNameAr: { type: 'string' },
                  organizationNameEn: { type: 'string', nullable: true },
                  organizationSlug: { type: 'string', nullable: true },
                  role: { type: 'string' },
                  logoUrl: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        {
          type: 'object',
          description: '2FA required (super-admin)',
          properties: {
            requiresOtp: { type: 'boolean', enum: [true] },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials or unrecognized organization', type: ApiErrorDto })
  @ApiResponse({ status: 429, description: 'Too many attempts, try again later', type: ApiErrorDto })
  async loginEndpoint(
    @Body() body: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.login.execute({
      email: body.email,
      password: body.password,
      organizationId: body.organizationId,
      ip,
    });

    // Multi-org: user has multiple memberships and no org hint was provided.
    // Return the chooser payload immediately — no tokens, no cookie.
    if ('requires_org_selection' in tokens) {
      return tokens as OrgSelectionRequired;
    }

    // Host-based namespace enforcement (TAR-99)
    // Use forwarded headers because the request is proxied through Next.js
    // rewrite — req.headers.host reflects the backend, not the original host.
    const requestHost = String(
      (req.headers['x-deqah-tenant-host'] ?? req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
    ).toLowerCase();
    const adminHosts = (this.config.get<string>('ADMIN_HOSTS', 'admin.deqah.app'))
      .split(',').map((h) => h.trim().toLowerCase());
    const isAdminHost = adminHosts.includes(requestHost);

    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        gender: true,
        avatarUrl: true,
        isActive: true,
        role: true,
        isSuperAdmin: true,
        customRoleId: true,
        customRole: { include: { permissions: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (isAdminHost && !user?.isSuperAdmin) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!isAdminHost && user?.isSuperAdmin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // If 2FA required and user is super-admin → require OTP step
    if (user?.isSuperAdmin) {
      const require2fa = await this.settings.get<boolean>('security.twoFactor.required');
      if (require2fa) {
        return { requiresOtp: true };
      }
    }

    if (!user) {
      this.setRefreshCookie(res, tokens.refreshToken);
      return {
        accessToken: tokens.accessToken,
        user,
        expiresIn: this.parseTtlSeconds(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'),
      };
    }

    // SaaS-04 alignment: surface the active membership's organizationId on
    // the login response so mobile/dashboard consumers don't need to decode
    // the JWT to find their tenant. Mirrors LoginHandler's resolution order.
    // Bug B5: also pull the per-org role so the response `permissions` array
    // reflects `Membership.role`, not the legacy `User.role`.
    // Membership is a scoped model and login runs before tenant context is
    // resolved — use $allTenants under super-admin CLS, same pattern as
    // LoginHandler.execute() and refreshEndpoint() below.
    // SAFE: auth controller; $allTenants used for cross-org token operations (refresh, logout, switch-org)
    const membership = await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      return this.prisma.$allTenants.membership.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { organizationId: true, role: true },
      });
    });

    // Match GetCurrentUserHandler: derive firstName/lastName from `name`
    // by splitting on the first whitespace run.
    const [firstName = '', ...rest] = (user.name ?? '').trim().split(/\s+/);

    this.setRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      user: {
        ...user,
        firstName,
        lastName: rest.join(' '),
        isSuperAdmin: user.isSuperAdmin,
        organizationId: membership?.organizationId ?? null,
        permissions: flattenPermissions({
          membershipRole: membership?.role ?? null,
          role: user.role,
          customRole: user.customRole,
        }),
      },
      expiresIn: this.parseTtlSeconds(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'),
    };
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token and issue new access token (refresh token rotated via cookie)' })
  @ApiOkResponse({
    description: 'New access token (rotated refresh token delivered as httpOnly cookie ck_refresh)',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        expiresIn: { type: 'number', example: 900 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token', type: ApiErrorDto })
  async refreshEndpoint(
    @Body() body: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = (req.cookies as Record<string, string>)?.['ck_refresh'] ?? body.refreshToken;
    if (!rawToken) throw new UnauthorizedException('No refresh token');

    // RefreshToken/Membership are tenant-scoped, but the refresh endpoint runs
    // before any tenant context exists. Set SUPER_ADMIN_CONTEXT to allow the
    // $allTenants reads/updates. Identity is enforced by tokenHash + bcrypt
    // inside findActiveToken.
    return this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);

      const record = await this.findActiveToken(rawToken);

      await this.prisma.$allTenants.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: record.userId },
        include: { customRole: { include: { permissions: true } } },
      });

      if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

      const orgId = record.organizationId ?? DEFAULT_ORGANIZATION_ID;
      const membership = await this.prisma.$allTenants.membership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
        select: { id: true, role: true },
      });

      const tokens = await this.tokens.issueTokenPair(user, {
        organizationId: orgId,
        membershipId: membership?.id,
        membershipRole: membership?.role ?? undefined,
        isSuperAdmin: user.isSuperAdmin,
      });
      this.setRefreshCookie(res, tokens.refreshToken);
      return {
        accessToken: tokens.accessToken,
        expiresIn: this.parseTtlSeconds(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'),
      };
    });
  }

  @Post('logout')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token (log out)' })
  @ApiNoContentResponse({ description: 'Token revoked; no body returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token', type: ApiErrorDto })
  async logoutEndpoint(
    @Body() body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = (req.cookies as Record<string, string>)?.['ck_refresh'] ?? body.refreshToken;
    res.clearCookie('ck_refresh', { path: '/' });
    if (!rawToken) return;
    // Same reasoning as refreshEndpoint — public path, no tenant context.
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      const record = await this.findActiveToken(rawToken);
      await this.logout.execute({ userId: record.userId });
    });
  }

  @Get('me')
  @UseGuards(JwtGuard)
  @AllowDuringSuspension()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiOkResponse({
    description: 'Current user profile with role and permissions',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string' },
        phone: { type: 'string', nullable: true },
        avatarUrl: { type: 'string', nullable: true },
        role: { type: 'string' },
        isSuperAdmin: { type: 'boolean' },
        organizationId: { type: 'string', format: 'uuid', nullable: true },
        permissions: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiErrorDto })
  async meEndpoint(@UserId() userId: string) {
    const user = await this.getCurrentUser.execute({ userId } satisfies GetCurrentUserQuery);
    return { ...user, permissions: flattenPermissions(user) };
  }

  @Get('memberships')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List organizations the current user belongs to',
    description:
      'SaaS-06 — powers the tenant switcher. Returns one row per ACTIVE ' +
      'membership for the caller, with the organization summary attached.',
  })
  @ApiOkResponse({
    description: 'Array of MembershipSummary rows',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          membershipId: { type: 'string', format: 'uuid' },
          organizationId: { type: 'string', format: 'uuid' },
          organizationName: { type: 'string' },
          role: { type: 'string' },
          displayName: { type: 'string', nullable: true },
          jobTitle: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiErrorDto })
  async membershipsEndpoint(@UserId() userId: string) {
    return this.listMemberships.execute({ userId });
  }

  @Post('switch-org')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Switch active organization context',
    description:
      'SaaS-06 — issues a fresh access + refresh token pair scoped to the ' +
      'target organization. Caller must have an ACTIVE membership in the target. ' +
      'Refresh token is delivered as httpOnly cookie ck_refresh.',
  })
  @ApiOkResponse({
    description: 'New access token scoped to the target org (refresh token as httpOnly cookie ck_refresh)',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        expiresIn: { type: 'number', example: 900 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiErrorDto })
  @ApiResponse({
    status: 403,
    description: 'Caller has no active membership in the target organization',
    type: ApiErrorDto,
  })
  async switchOrgEndpoint(
    @UserId() userId: string,
    @Body() body: SwitchOrganizationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.switchOrganization.execute({
      userId,
      targetOrganizationId: body.organizationId,
    });
    this.setRefreshCookie(res, tokens.refreshToken);
    return {
      accessToken: tokens.accessToken,
      expiresIn: this.parseTtlSeconds(this.config.get<string>('JWT_ACCESS_TTL') ?? '15m'),
    };
  }

  @Patch('memberships/:id/profile')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Membership UUID', format: 'uuid', example: '00000000-0000-0000-0000-000000000000' })
  @ApiOperation({
    summary: "Update the caller's per-org display profile",
    description:
      "Per-membership-profile — updates displayName / jobTitle / avatarUrl " +
      "on the caller's own Membership. Cross-user edits are blocked (403).",
  })
  @ApiOkResponse({ description: 'Updated MembershipSummary-shaped row' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiErrorDto })
  @ApiResponse({ status: 403, description: 'Caller does not own the target membership', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Membership not found', type: ApiErrorDto })
  async updateMembershipProfileEndpoint(
    @UserId() userId: string,
    @Param('id') membershipId: string,
    @Body() body: UpdateMembershipProfileDto,
  ) {
    return this.updateMembershipProfile.execute({
      userId,
      membershipId,
      displayName: body.displayName,
      jobTitle: body.jobTitle,
      avatarUrl: body.avatarUrl,
    });
  }

  @Post('memberships/:id/avatar')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'Membership UUID', format: 'uuid', example: '00000000-0000-0000-0000-000000000000' })
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: "Avatar image for the caller's membership",
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: {
        avatar: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: "Upload an avatar for the caller's membership",
    description:
      'Per-membership-profile — stores at memberships/{id}/avatar-{ts}.{ext}. ' +
      'Max 5MB, image/jpeg|png|webp only. Cross-user uploads return 403. The ' +
      'previous avatar object is intentionally NOT deleted (audit trail).',
  })
  @ApiOkResponse({
    description: 'Persisted avatar URL',
    schema: {
      type: 'object',
      properties: { avatarUrl: { type: 'string', example: 'https://cdn.example.com/memberships/xxx/avatar.jpg' } },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid mime/size or empty file', type: ApiErrorDto })
  @ApiResponse({ status: 403, description: 'Caller does not own the membership', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Membership not found', type: ApiErrorDto })
  uploadMembershipAvatarEndpoint(
    @UserId() userId: string,
    @Param('id') membershipId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('avatar file is required');
    return this.uploadMembershipAvatar.execute({
      userId,
      membershipId,
      filename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Post('invitations')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Invite a user to the active organization',
    description:
      'Privacy-safe — the response is identical regardless of whether the ' +
      'invited email already has an account in the system. Only an active ' +
      'membership conflict is surfaced (409). Optional displayName/jobTitle ' +
      'are carried into the new Membership on accept.',
  })
  @ApiCreatedResponse({
    description: 'PENDING invitation row',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        role: { type: 'string' },
        status: { type: 'string', example: 'PENDING' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'Email already has an active membership in this org', type: ApiErrorDto })
  async inviteUserEndpoint(
    @UserId() userId: string,
    @Body() body: InviteUserDto,
  ) {
    const organizationId = this.tenant.requireOrganizationId();
    return this.inviteUser.execute({
      invitedByUserId: userId,
      organizationId,
      email: body.email,
      role: body.role,
      displayName: body.displayName,
      jobTitle: body.jobTitle,
    });
  }

  @Post('invitations/accept')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept a pending invitation token',
    description:
      'Idempotent on the token. If the email already has an account, the new ' +
      'Membership is linked silently. If not, password + name are required to ' +
      'create the User. Expired or already-accepted tokens return 410 Gone.',
  })
  @ApiOkResponse({
    description: 'Active Membership info',
    schema: {
      type: 'object',
      properties: {
        membershipId: { type: 'string', format: 'uuid' },
        organizationId: { type: 'string', format: 'uuid' },
        role: { type: 'string' },
        isActive: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing password/name for new account', type: ApiErrorDto })
  @ApiResponse({ status: 404, description: 'Token not found', type: ApiErrorDto })
  @ApiResponse({ status: 410, description: 'Token expired or already used', type: ApiErrorDto })
  async acceptInvitationEndpoint(@Body() body: AcceptInvitationDto) {
    return this.acceptInvitation.execute({
      token: body.token,
      password: body.password,
      name: body.name,
    });
  }

  @Patch('password/change')
  @UseGuards(JwtGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the current user\'s password' })
  @ApiNoContentResponse({ description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Missing/invalid JWT or wrong current password', type: ApiErrorDto })
  async changePasswordEndpoint(
    @UserId() userId: string,
    @Body() body: ChangePasswordDto,
  ) {
    await this.changePassword.execute({
      userId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
  }

  @Public()
  @Post('request-password-reset')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Request a password reset email for a staff (User) account' })
  @ApiNoContentResponse({ description: 'Reset email sent (response is identical regardless of whether the email exists)' })
  async requestPasswordResetEndpoint(@Body() dto: RequestPasswordResetDto): Promise<void> {
    await this.requestPasswordReset.execute(dto);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset staff (User) password using a token from the reset email' })
  @ApiNoContentResponse({ description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token', type: ApiErrorDto })
  async performPasswordResetEndpoint(@Body() dto: PerformPasswordResetDto): Promise<void> {
    await this.performPasswordReset.execute(dto);
  }

  @Public()
  @Post('otp/request-dashboard')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP for dashboard login' })
  @ApiOkResponse({
    description: 'OTP sent successfully',
    schema: { properties: { success: { type: 'boolean' } } },
  })
  async requestDashboardOtpEndpoint(@Body() dto: RequestDashboardOtpDto): Promise<{ success: boolean }> {
    return this.requestDashboardOtp.execute(dto);
  }

  @Public()
  @Post('otp/verify-dashboard')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for dashboard login' })
  @ApiOkResponse({
    description: 'Access token with user profile (refresh token delivered as httpOnly cookie ck_refresh)',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        expiresIn: { type: 'number', example: 900 },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            gender: { type: 'string', nullable: true },
            avatarUrl: { type: 'string', nullable: true },
            isActive: { type: 'boolean' },
            role: { type: 'string' },
            isSuperAdmin: { type: 'boolean' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            organizationId: { type: 'string', format: 'uuid', nullable: true },
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid OTP code', type: ApiErrorDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired code', type: ApiErrorDto })
  async verifyDashboardOtpEndpoint(
    @Body() dto: VerifyDashboardOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.verifyDashboardOtp.execute(dto);
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _rt, ...safeResult } = result;
    return safeResult;
  }

  private setRefreshCookie(res: Response, token: string): void {
    const ttlMs = this.parseTtlSeconds(
      this.config.get<string>('JWT_REFRESH_TTL') ?? '30d',
    ) * 1000;
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

  // Uses tokenSelector (first 8 chars of the raw UUID) as an indexed DB filter
  // so the bcrypt.compare runs on at most a handful of rows, not the full table.
  //
  // RefreshToken is in SCOPED_MODELS, but /auth/refresh and /auth/logout are
  // public — there is no CLS tenant context yet (the whole point of refresh
  // is that we are about to *issue* one). $allTenants requires the
  // SUPER_ADMIN_CONTEXT_CLS_KEY flag, so callers must wrap this in
  // `cls.run(() => { cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true); ... })`.
  // The bcrypt.compare below is the actual identity check.
  private async findActiveToken(rawToken: string) {
    const selector = rawToken.slice(0, 8);

    const candidates = await this.prisma.$allTenants.refreshToken.findMany({
      where: { tokenSelector: selector, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    for (const c of candidates) {
      if (await bcrypt.compare(rawToken, c.tokenHash)) return c;
    }

    throw new UnauthorizedException('Invalid or expired refresh token');
  }
}
