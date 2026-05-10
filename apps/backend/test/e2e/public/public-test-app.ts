import SuperTest from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, getStorageToken } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../../src/app.module';
import { FcmService } from '../../../src/infrastructure/mail/fcm.service';
import { SmtpService } from '../../../src/infrastructure/mail/smtp.service';
import { EmbeddingAdapter } from '../../../src/infrastructure/ai/embedding.adapter';
import { ChatAdapter } from '../../../src/infrastructure/ai/chat.adapter';
import { SemanticSearchHandler } from '../../../src/modules/ai/semantic-search/semantic-search.handler';
import { MinioService } from '../../../src/infrastructure/storage/minio.service';
import { MoyasarApiClient } from '../../../src/modules/finance/moyasar-api/moyasar-api.client';
import { EmailChannelAdapter } from '../../../src/modules/comms/notification-channel/email-channel.adapter';
import { CAPTCHA_VERIFIER } from '../../../src/modules/comms/contact-messages/captcha.verifier';

const TEST_JWT_ACCESS_SECRET = 'test-access-secret-32chars-min';
const TEST_JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-min';
export const TEST_JWT_CLIENT_ACCESS_SECRET = 'test-client-access-secret-32chars';
export const TEST_JWT_CLIENT_REFRESH_TTL = '14d';
const TEST_SMS_PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://deqah:deqah_dev_password@127.0.0.1:5999/deqah_test?schema=public';

/**
 * In-memory store for OTP codes captured by the stub email adapter.
 * Key: identifier (email). Value: most-recently captured plaintext code.
 * Tests read from here instead of using a deterministic code.
 */
export const capturedOtpCodes: Map<string, string> = new Map();

const mockMoyasarPayment = {
  id: 'moyasar-pay-test-1',
  amount: 23000,
  currency: 'SAR',
  status: 'paid' as const,
  description: 'Booking payment',
  metadata: { invoiceId: '', bookingId: '' },
  redirectUrl: 'https://checkout.moyasar.com/pay/moyasar-pay-test-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let cachedApp: INestApplication | null = null;

export interface PublicTestApp {
  request: SuperTest.Agent;
  /** Raw http.Server — use SuperTest.agent(httpServer) when you need cookie persistence. */
  httpServer: ReturnType<INestApplication['getHttpServer']>;
}

export async function createPublicTestApp(): Promise<PublicTestApp> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '5380';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.FCM_PROJECT_ID = 'test-project';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.LICENSE_SERVER_URL = 'http://localhost:9999';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_PORT = '9000';
  process.env.MINIO_ACCESS_KEY = 'minioadmin';
  process.env.MINIO_SECRET_KEY = 'minioadmin123';
  process.env.MINIO_BUCKET = 'deqah';
  process.env.JWT_ACCESS_SECRET = TEST_JWT_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_JWT_REFRESH_SECRET;
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.SMS_PROVIDER_ENCRYPTION_KEY = TEST_SMS_PROVIDER_ENCRYPTION_KEY;
  process.env.ZOOM_PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
  process.env.MOYASAR_TENANT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

  const CONFIG_MAP: Record<string, string | number> = {
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_ACCESS_SECRET: TEST_JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: TEST_JWT_REFRESH_SECRET,
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    JWT_CLIENT_ACCESS_SECRET: TEST_JWT_CLIENT_ACCESS_SECRET,
    JWT_CLIENT_ACCESS_TTL: '15m',
    JWT_CLIENT_REFRESH_TTL: TEST_JWT_CLIENT_REFRESH_TTL,
    REDIS_HOST: 'localhost',
    REDIS_PORT: 5380,
    OPENAI_API_KEY: 'test-key',
    OPENROUTER_API_KEY: 'test-key',
    FCM_PROJECT_ID: 'test-project',
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    LICENSE_SERVER_URL: 'http://localhost:9999',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: 9000,
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin123',
    MINIO_BUCKET: 'deqah',
    SMS_PROVIDER_ENCRYPTION_KEY: TEST_SMS_PROVIDER_ENCRYPTION_KEY,
    ZOOM_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
    MOYASAR_TENANT_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    MOYASAR_PLATFORM_SECRET_KEY: 'test-moyasar-platform-key',
    MOYASAR_PLATFORM_WEBHOOK_SECRET: 'test-moyasar-webhook-secret',
    TENANT_ENFORCEMENT: 'permissive',
    DEFAULT_ORGANIZATION_ID: '00000000-0000-0000-0000-000000000001',
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    // Override the throttler storage so route-level @Throttle limits are never enforced.
    .overrideProvider(getStorageToken())
    .useValue({
      increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
    })
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string, defaultValue?: string | number) =>
        CONFIG_MAP[key] ?? process.env[key] ?? defaultValue,
      getOrThrow: (key: string) => {
        const val = CONFIG_MAP[key] ?? process.env[key];
        if (val === undefined) throw new Error(`Config key ${key} not found`);
        return val;
      },
    })
    .overrideProvider(FcmService)
    .useValue({ sendPush: jest.fn().mockResolvedValue(undefined) })
    .overrideProvider(SmtpService)
    .useValue({
      isAvailable: () => true,
      sendMail: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      sendTemplate: jest.fn().mockResolvedValue(undefined),
    })
    .overrideProvider(EmbeddingAdapter)
    .useValue({
      isAvailable: () => true,
      embed: jest.fn().mockResolvedValue([new Array(1536).fill(0)]),
    })
    .overrideProvider(SemanticSearchHandler)
    .useValue({ execute: jest.fn().mockResolvedValue([]) })
    .overrideProvider(ChatAdapter)
    .useValue({
      isAvailable: () => true,
      complete: jest.fn(async (messages: Array<{ role: string; content: string }>) => {
        const last = messages[messages.length - 1]?.content ?? '';
        return `test reply for: ${last}`;
      }),
      stream: jest.fn(async function* () {
        yield 'test ';
        yield 'reply';
      }),
    })
    .overrideProvider(MinioService)
    .useValue({
      uploadFile: jest.fn().mockResolvedValue('http://localhost:9000/deqah/mocked-key'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue('http://localhost:9000/deqah/mocked-key?sig=x'),
      fileExists: jest.fn().mockResolvedValue(true),
    })
    .overrideProvider(MoyasarApiClient)
    .useValue({
      createPayment: jest.fn().mockResolvedValue(mockMoyasarPayment),
      toPaymentStatus: jest.fn().mockReturnValue('COMPLETED' as never),
      toPaymentMethod: jest.fn().mockReturnValue('ONLINE_CARD' as never),
    })
    // Stub the email channel adapter so it captures the plaintext OTP code.
    .overrideProvider(EmailChannelAdapter)
    .useValue({
      kind: 'EMAIL' as const,
      send: jest.fn().mockImplementation(async (identifier: string, code: string) => {
        capturedOtpCodes.set(identifier, code);
      }),
    })
    // Stub the captcha verifier: accept only 'test-valid', reject everything else.
    .overrideProvider(CAPTCHA_VERIFIER)
    .useValue({
      verify: async (token: string | undefined | null): Promise<boolean> => {
        return token === 'test-valid';
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  cachedApp = app;

  const httpServer = app.getHttpServer() as ReturnType<INestApplication['getHttpServer']>;
  return { request: SuperTest(httpServer), httpServer };
}

export async function closePublicTestApp(): Promise<void> {
  if (cachedApp) {
    await cachedApp.close();
    cachedApp = null;
  }
}
