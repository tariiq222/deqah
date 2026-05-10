import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { VerifyOtpHandler } from './verify-otp.handler';
import { OtpSessionService } from './otp-session.service';
import { PrismaService } from '../../../infrastructure/database';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('VerifyOtpHandler', () => {
  let handler: VerifyOtpHandler;
  let otpSession: jest.Mocked<OtpSessionService>;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      otpCode: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      client: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyOtpHandler,
        { provide: OtpSessionService, useValue: { signSession: jest.fn().mockResolvedValue('mock-token') } },
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ClsService,
          useValue: {
            run: jest.fn().mockImplementation((fn) => fn()),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<VerifyOtpHandler>(VerifyOtpHandler);
    otpSession = module.get(OtpSessionService);
  });

  it('rejects code from a different org', async () => {
    prismaMock.otpCode.findFirst.mockResolvedValue(null);
    prismaMock.otpCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      code: '1234',
      purpose: OtpPurpose.GUEST_BOOKING,
      organizationId: 'org-B',
      hCaptchaToken: 'test-token',
    })).rejects.toThrow('Invalid or expired OTP code');

    expect(prismaMock.otpCode.updateMany).not.toHaveBeenCalled();
  });

  it('accepts NULL/NULL (legacy/platform flow)', async () => {
    const correctCode = '1234';
    const correctHash = await bcrypt.hash(correctCode, 10);
    prismaMock.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1',
      organizationId: null,
      attempts: 0,
      maxAttempts: 5,
      lockedUntil: null,
      codeHash: correctHash,
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      expiresAt: new Date(Date.now() + 60000),
      consumedAt: null,
      createdAt: new Date(),
    });
    prismaMock.otpCode.update.mockResolvedValue({} as never);
    prismaMock.otpCode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.client.updateMany.mockResolvedValue({ count: 0 });

    const result = await handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      code: correctCode,
      purpose: OtpPurpose.GUEST_BOOKING,
      hCaptchaToken: 'test-token',
      // organizationId is omitted -> null
    });

    expect(result).toEqual({ sessionToken: 'mock-token' });
    expect(otpSession.signSession).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: null }),
    );
  });

  it('accepts org-A from org-A', async () => {
    const orgA = 'org-A';
    const correctCode = '1234';
    const correctHash = await bcrypt.hash(correctCode, 10);
    prismaMock.otpCode.findFirst.mockResolvedValue({
      id: 'otp-1',
      organizationId: orgA,
      attempts: 0,
      maxAttempts: 5,
      lockedUntil: null,
      codeHash: correctHash,
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      expiresAt: new Date(Date.now() + 60000),
      consumedAt: null,
      createdAt: new Date(),
    });
    prismaMock.otpCode.update.mockResolvedValue({} as never);
    prismaMock.otpCode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.client.updateMany.mockResolvedValue({ count: 0 });

    const result = await handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      code: correctCode,
      purpose: OtpPurpose.GUEST_BOOKING,
      organizationId: orgA,
      hCaptchaToken: 'test-token',
    });

    expect(result).toEqual({ sessionToken: 'mock-token' });
    expect(otpSession.signSession).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgA }),
    );
  });
});
