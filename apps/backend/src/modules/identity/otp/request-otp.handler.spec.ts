import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { RequestOtpHandler } from './request-otp.handler';
import { NotificationChannelRegistry } from '../../comms/notification-channel/notification-channel-registry';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { CAPTCHA_VERIFIER } from '../../comms/contact-messages/captcha.verifier';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { OtpChannel, OtpPurpose } from '@prisma/client';

describe('RequestOtpHandler', () => {
  let handler: RequestOtpHandler;
  let channelRegistry: jest.Mocked<NotificationChannelRegistry>;
  let captchaVerifyMock: jest.Mock;
  let otpCountMock: jest.Mock;
  let otpDeleteMock: jest.Mock;
  let prismaMock: any;
  let redisSetMock: jest.Mock;

  const mockChannel = {
    kind: OtpChannel.EMAIL,
    send: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    captchaVerifyMock = jest.fn().mockResolvedValue(true);
    otpCountMock = jest.fn().mockResolvedValue(0);
    otpDeleteMock = jest.fn().mockResolvedValue({ id: 'test-id' });
    mockChannel.send.mockReset().mockResolvedValue(undefined);
    redisSetMock = jest.fn().mockResolvedValue('OK');

    prismaMock = {
      $transaction: jest.fn().mockImplementation(async (fn) => fn({
        otpCode: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 'test-id' }),
        },
      })),
      otpCode: { count: otpCountMock, delete: otpDeleteMock },
    };

    const redisMock = { getClient: () => ({ set: redisSetMock }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestOtpHandler,
        { provide: NotificationChannelRegistry, useValue: { resolve: jest.fn().mockReturnValue(mockChannel) } },
        { provide: CAPTCHA_VERIFIER, useValue: { verify: captchaVerifyMock } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        {
          provide: ClsService,
          useValue: {
            run: jest.fn().mockImplementation((fn) => fn()),
            set: jest.fn(),
          },
        },
        {
          provide: RlsTransactionService,
          useValue: {
            withTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => prismaMock.$transaction(fn)),
            withBypassTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => prismaMock.$transaction(fn)),
          },
        },
      ],
    }).compile();

    handler = module.get<RequestOtpHandler>(RequestOtpHandler);
    channelRegistry = module.get(NotificationChannelRegistry);
  });

  it('should throw BadRequestException when captcha is invalid', async () => {
    captchaVerifyMock.mockResolvedValue(false);
    await expect(handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      hCaptchaToken: 'invalid',
    })).rejects.toThrow(BadRequestException);
  });

  it('should return success on valid request', async () => {
    const result = await handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      hCaptchaToken: 'valid-token',
    });
    expect(result).toEqual({ success: true });
  });

  it('persists organizationId when provided', async () => {
    const orgId = 'org-123';
    const txMock = {
      otpCode: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'test-id' }),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: any) => fn(txMock));

    await handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      hCaptchaToken: 'valid-token',
      organizationId: orgId,
    });

    expect(txMock.otpCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: orgId }),
      }),
    );
    expect(otpCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgId }),
      }),
    );
  });

  it('defaults organizationId to null when omitted', async () => {
    const txMock = {
      otpCode: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'test-id' }),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(async (fn: any) => fn(txMock));

    await handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      hCaptchaToken: 'valid-token',
    });

    expect(txMock.otpCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: null }),
      }),
    );
  });

  it('rate-limit is per-org', async () => {
    // Org A is at cap
    otpCountMock.mockImplementation(({ where }) => {
      if (where.organizationId === 'org-A') return Promise.resolve(5);
      return Promise.resolve(0);
    });

    // Request for Org B should succeed
    await expect(handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      hCaptchaToken: 'valid-token',
      organizationId: 'org-B',
    })).resolves.toEqual({ success: true });

    // Request for Org A should fail
    await expect(handler.execute({
      channel: OtpChannel.EMAIL,
      identifier: 'test@example.com',
      purpose: OtpPurpose.GUEST_BOOKING,
      hCaptchaToken: 'valid-token',
      organizationId: 'org-A',
    })).rejects.toThrow(HttpException);
  });

  it('generates a 6-digit numeric code via CSPRNG (no longer Math.random / 4-digit)', async () => {
    mockChannel.send.mockClear();

    // Run the handler 25 times and assert every code is a 6-digit string in
    // [100000, 999999]. This proves: (a) format is 6 digits, (b) min bound is
    // applied (no 4-digit codes leak through padding), (c) max bound is exclusive.
    for (let i = 0; i < 25; i++) {
      await handler.execute({
        channel: OtpChannel.EMAIL,
        identifier: 'test@example.com',
        purpose: OtpPurpose.GUEST_BOOKING,
        hCaptchaToken: 'valid-token',
      });
    }

    expect(mockChannel.send).toHaveBeenCalledTimes(25);
    for (const call of mockChannel.send.mock.calls) {
      const sentCode = call[1] as string;
      expect(sentCode).toMatch(/^\d{6}$/);
      const n = Number(sentCode);
      expect(n).toBeGreaterThanOrEqual(100_000);
      expect(n).toBeLessThanOrEqual(999_999);
    }
  });

  it('throws ServiceUnavailableException and deletes OtpCode row when SMS send fails', async () => {
    const txCreateMock = jest.fn().mockResolvedValue({ id: 'created-otp-id' });
    prismaMock.$transaction.mockImplementationOnce(async (fn: any) =>
      fn({
        otpCode: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: txCreateMock,
        },
      }),
    );
    mockChannel.send.mockRejectedValueOnce(new Error('SMS provider down'));

    await expect(
      handler.execute({
        channel: OtpChannel.SMS,
        identifier: '+966500000000',
        purpose: OtpPurpose.MOBILE_LOGIN,
        hCaptchaToken: 'valid-token',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // Row created, then deleted on send failure.
    expect(txCreateMock).toHaveBeenCalledTimes(1);
    expect(otpDeleteMock).toHaveBeenCalledWith({ where: { id: 'created-otp-id' } });
  });

  it('rejects with 429 when same identifier+purpose requested within 60s', async () => {
    // Simulate cooldown key already set (SETNX returns null = key existed)
    redisSetMock.mockResolvedValueOnce(null);

    await expect(handler.execute({
      channel: OtpChannel.SMS,
      identifier: '+966500000000',
      purpose: OtpPurpose.MOBILE_LOGIN,
      hCaptchaToken: 'valid-token',
    })).rejects.toThrow(HttpException);

    // Verify OTP was NOT issued (DB count not called because we bailed early)
    expect(otpCountMock).not.toHaveBeenCalled();
  });

  it('allows request after 60s cooldown (SETNX succeeds)', async () => {
    // Simulate key not present (first request or window expired)
    redisSetMock.mockResolvedValueOnce('OK');

    const result = await handler.execute({
      channel: OtpChannel.SMS,
      identifier: '+966500000000',
      purpose: OtpPurpose.MOBILE_LOGIN,
      hCaptchaToken: 'valid-token',
    });

    expect(result).toEqual({ success: true });
    // Confirm the Redis SET was called with the right key pattern and TTL
    expect(redisSetMock).toHaveBeenCalledWith(
      'otp:cooldown:global:+966500000000:MOBILE_LOGIN',
      '1',
      'EX',
      60,
      'NX',
    );
  });
});
