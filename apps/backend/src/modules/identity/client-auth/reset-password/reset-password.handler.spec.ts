import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { ResetPasswordHandler } from './reset-password.handler';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { OtpSessionService } from '../../otp/otp-session.service';
import { PasswordService } from '../../shared/password.service';
import { TenantContextService } from '../../../../common/tenant';
import { PasswordHistoryService } from '../shared/password-history.service';

describe('ResetPasswordHandler', () => {
  let handler: ResetPasswordHandler;

  const mockTx = {
    client: {
      update: jest.fn(),
    },
    usedOtpSession: { create: jest.fn() },
    clientRefreshToken: { updateMany: jest.fn() },
    passwordHistory: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrisma: {
    client: { findFirst: jest.Mock };
  } = {
    client: { findFirst: jest.fn() },
  };

  const mockOtpSession = { verifySession: jest.fn() };
  const mockPasswords = { hash: jest.fn() };
  const mockPasswordHistory = {
    assertNotReused: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(undefined),
  };

  const validSession = {
    identifier: 'user@example.com',
    purpose: OtpPurpose.CLIENT_PASSWORD_RESET,
    channel: OtpChannel.EMAIL,
    jti: 'test-jti-1',
    exp: Math.floor(Date.now() / 1000) + 1800,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPasswordHistory.assertNotReused.mockResolvedValue(undefined);
    mockPasswordHistory.record.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResetPasswordHandler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OtpSessionService, useValue: mockOtpSession },
        { provide: PasswordService, useValue: mockPasswords },
        { provide: TenantContextService, useValue: { requireOrganizationIdOrDefault: () => 'org-test' } },
        { provide: PasswordHistoryService, useValue: mockPasswordHistory },
        {
          provide: RlsTransactionService,
          useValue: {
            withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
          },
        },
      ],
    }).compile();

    handler = module.get<ResetPasswordHandler>(ResetPasswordHandler);
  });

  describe('execute', () => {
    it('resets password and revokes refresh tokens on success', async () => {
      mockOtpSession.verifySession.mockReturnValue(validSession);
      mockPasswords.hash.mockResolvedValue('new-hash');
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'client-1', email: 'user@example.com', passwordHash: 'old-hash' });
      mockTx.usedOtpSession.create.mockResolvedValue({});
      mockTx.client.update.mockResolvedValue({});
      mockTx.clientRefreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(
        handler.execute({ sessionToken: 'valid-token', newPassword: 'NewPass123', hCaptchaToken: 'test-token' }),
      ).resolves.toBeUndefined();

      expect(mockPasswordHistory.assertNotReused).toHaveBeenCalledWith(
        'client-1',
        'org-test',
        'NewPass123',
        'old-hash',
      );
      expect(mockTx.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: expect.objectContaining({ passwordHash: 'new-hash', loginAttempts: 0, lockoutUntil: null }),
      });
      expect(mockPasswordHistory.record).toHaveBeenCalledWith(mockTx, 'client-1', 'org-test', 'new-hash');
      expect(mockTx.clientRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1', organizationId: 'org-test', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('throws Unauthorized when session token is invalid', async () => {
      mockOtpSession.verifySession.mockReturnValue(null);

      await expect(
        handler.execute({ sessionToken: 'bad-token', newPassword: 'NewPass123', hCaptchaToken: 'test-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized when session purpose is not CLIENT_PASSWORD_RESET', async () => {
      mockOtpSession.verifySession.mockReturnValue({
        ...validSession,
        purpose: OtpPurpose.CLIENT_LOGIN,
      });

      await expect(
        handler.execute({ sessionToken: 'token', newPassword: 'NewPass123', hCaptchaToken: 'test-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized when client not found for identifier', async () => {
      mockOtpSession.verifySession.mockReturnValue(validSession);
      mockPrisma.client.findFirst.mockResolvedValue(null);

      await expect(
        handler.execute({ sessionToken: 'token', newPassword: 'NewPass123', hCaptchaToken: 'test-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized when OTP session jti is already burned (replay)', async () => {
      mockOtpSession.verifySession.mockReturnValue(validSession);
      mockPasswords.hash.mockResolvedValue('new-hash');
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'client-1', email: 'user@example.com', passwordHash: 'old-hash' });
      mockTx.usedOtpSession.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(
        handler.execute({ sessionToken: 'token', newPassword: 'NewPass123', hCaptchaToken: 'test-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when new password is in history', async () => {
      mockOtpSession.verifySession.mockReturnValue(validSession);
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'client-1', email: 'user@example.com', passwordHash: 'old-hash' });
      mockPasswordHistory.assertNotReused.mockRejectedValue(new Error('PASSWORD_REUSED'));

      await expect(
        handler.execute({ sessionToken: 'token', newPassword: 'ReusedPass1', hCaptchaToken: 'test-token' }),
      ).rejects.toThrow('PASSWORD_REUSED');
      expect(mockTx.client.update).not.toHaveBeenCalled();
    });

    it('looks up client by phone for SMS channel', async () => {
      mockOtpSession.verifySession.mockReturnValue({
        ...validSession,
        identifier: '+966500000001',
        channel: OtpChannel.SMS,
      });
      mockPasswords.hash.mockResolvedValue('new-hash');
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'client-2', phone: '+966500000001', passwordHash: null });
      mockTx.usedOtpSession.create.mockResolvedValue({});
      mockTx.client.update.mockResolvedValue({});
      mockTx.clientRefreshToken.updateMany.mockResolvedValue({ count: 0 });

      await handler.execute({ sessionToken: 'token', newPassword: 'NewPass123', hCaptchaToken: 'test-token' });

      expect(mockPrisma.client.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-test', phone: '+966500000001', deletedAt: null },
      });
    });
  });
});
