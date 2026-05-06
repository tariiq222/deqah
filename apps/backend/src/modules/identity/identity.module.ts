import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '../../infrastructure/database';
import { TenantModule } from '../../common/tenant';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { JwtStrategy } from './jwt.strategy';
import { ClientJwtStrategy } from './client-jwt.strategy';
import { PasswordService } from './shared/password.service';
import { TokenService } from './shared/token.service';
import { ClientTokenService } from './shared/client-token.service';
import { LoginHandler } from './login/login.handler';
import { RefreshTokenHandler } from './refresh-token/refresh-token.handler';
import { LogoutHandler } from './logout/logout.handler';
import { GetCurrentUserHandler } from './get-current-user/get-current-user.handler';
import { CreateUserHandler } from './users/create-user.handler';
import { GetUserHandler } from './users/get-user.handler';
import { UpdateUserHandler } from './users/update-user.handler';
import { ListUsersHandler } from './users/list-users.handler';
import { DeactivateUserHandler } from './users/deactivate-user.handler';
import { DeleteUserHandler } from './users/delete-user.handler';
import { AssignRoleHandler } from './users/assign-role.handler';
import { RemoveRoleHandler } from './users/remove-role.handler';
import { CreateRoleHandler } from './roles/create-role.handler';
import { DeleteRoleHandler } from './roles/delete-role.handler';
import { AssignPermissionsHandler } from './roles/assign-permissions.handler';
import { ListRolesHandler } from './roles/list-roles.handler';
import { ListPermissionsHandler } from './roles/list-permissions.handler';
import { ChangePasswordHandler } from './users/change-password.handler';
import { CaslAbilityFactory } from './casl/casl-ability.factory';
import { DashboardIdentityController } from '../../api/dashboard/identity.controller';
import { RequestOtpHandler } from './otp/request-otp.handler';
import { VerifyOtpHandler } from './otp/verify-otp.handler';
import { OtpSessionService } from './otp/otp-session.service';
import { OtpSessionGuard } from './otp/otp-session.guard';
import { NotificationChannelModule } from '../comms/notification-channel/notification-channel.module';
import { CAPTCHA_VERIFIER, createCaptchaVerifier } from '../comms/contact-messages/captcha.verifier';
import { ClientSessionGuard } from '../../common/guards/client-session.guard';
import { RegisterHandler } from './client-auth/register.handler';
import { ClientLoginHandler } from './client-auth/client-login.handler';
import { ClientRefreshHandler } from './client-auth/client-refresh.handler';
import { ClientLogoutHandler } from './client-auth/client-logout.handler';
import { GetMeHandler } from './client-auth/get-me.handler';
import { ResetPasswordHandler } from './client-auth/reset-password/reset-password.handler';
import { PasswordHistoryService } from './client-auth/shared/password-history.service';
import { ListMembershipsHandler } from './list-memberships/list-memberships.handler';
import { SwitchOrganizationHandler } from './switch-organization/switch-organization.handler';
import { UpdateMembershipProfileHandler } from './update-membership-profile/update-membership-profile.handler';
import { UploadMembershipAvatarHandler } from './update-membership-profile/upload-membership-avatar.handler';
import { InviteUserHandler } from './invite-user/invite-user.handler';
import { AcceptInvitationHandler } from './accept-invitation/accept-invitation.handler';
import { MailModule } from '../../infrastructure/mail';
import { StorageModule } from '../../infrastructure/storage';
import { RequestPasswordResetHandler } from './user-password-reset/request-password-reset/request-password-reset.handler';
import { PerformPasswordResetHandler } from './user-password-reset/perform-password-reset/perform-password-reset.handler';
import { CommsModule } from '../comms/comms.module';
import { RegisterMobileUserHandler } from './register-mobile-user/register-mobile-user.handler';
import { RequestMobileLoginOtpHandler } from './request-mobile-login-otp/request-mobile-login-otp.handler';
import { VerifyMobileOtpHandler } from './verify-mobile-otp/verify-mobile-otp.handler';
import { RequestEmailVerificationHandler } from './request-email-verification/request-email-verification.handler';
import { VerifyEmailHandler } from './verify-email/verify-email.handler';
import { AttachMembershipHandler } from './attach-membership/attach-membership.handler';
import { OwnerProvisioningService } from './owner-provisioning/owner-provisioning.service';
import { RequestDashboardOtpHandler } from './request-dashboard-otp/request-dashboard-otp.handler';
import { VerifyDashboardOtpHandler } from './verify-dashboard-otp/verify-dashboard-otp.handler';

const handlers = [
  LoginHandler, RefreshTokenHandler, LogoutHandler,
  GetCurrentUserHandler, CreateUserHandler, GetUserHandler, UpdateUserHandler, ListUsersHandler,
  DeactivateUserHandler, DeleteUserHandler, AssignRoleHandler, RemoveRoleHandler,
  CreateRoleHandler, DeleteRoleHandler, AssignPermissionsHandler, ListRolesHandler,
  ListPermissionsHandler,
  ChangePasswordHandler,
  RequestPasswordResetHandler,
  PerformPasswordResetHandler,
  RequestOtpHandler,
  VerifyOtpHandler,
  RegisterHandler,
  ClientLoginHandler,
  ClientRefreshHandler,
  ClientLogoutHandler,
  GetMeHandler,
  ResetPasswordHandler,
  ListMembershipsHandler,
  SwitchOrganizationHandler,
  UpdateMembershipProfileHandler,
  UploadMembershipAvatarHandler,
  InviteUserHandler,
  AcceptInvitationHandler,
  RegisterMobileUserHandler,
  RequestMobileLoginOtpHandler,
  VerifyMobileOtpHandler,
  RequestEmailVerificationHandler,
  VerifyEmailHandler,
  AttachMembershipHandler,
  RequestDashboardOtpHandler,
  VerifyDashboardOtpHandler,
];

@Module({
  imports: [
    DatabaseModule,
    TenantModule,
    MailModule,
    StorageModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    NotificationChannelModule,
    CommsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: (config.get<string>('JWT_ACCESS_TTL') ?? '15m') as `${number}${'s'|'m'|'h'|'d'}` },
      }),
    }),
  ],
  controllers: [DashboardIdentityController],
  providers: [
    JwtStrategy,
    ClientJwtStrategy,
    PasswordService,
    PasswordHistoryService,
    TokenService,
    ClientTokenService,
    RedisService,
    CaslAbilityFactory,
    ClientSessionGuard,
    { provide: CAPTCHA_VERIFIER, useFactory: createCaptchaVerifier },
    ...handlers,
    OtpSessionService,
    OtpSessionGuard,
    OwnerProvisioningService,
  ],
  exports: [
    CaslAbilityFactory,
    TokenService,
    ClientTokenService,
    RedisService,
    PasswordService,
    ClientSessionGuard,
    RequestOtpHandler,
    VerifyOtpHandler,
    OtpSessionService,
    OtpSessionGuard,
    RegisterHandler,
    CAPTCHA_VERIFIER,
    OwnerProvisioningService,
    ...handlers,
  ],
})
export class IdentityModule {}
