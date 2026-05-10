/**
 * Verticals-specific test app factory.
 *
 * Extends the standard test-app pattern but adds TENANT_ENFORCEMENT=off and
 * DEFAULT_ORGANIZATION_ID to the ConfigService mock so TenantResolverMiddleware
 * fast-paths through without throwing TenantResolutionError (400) on every route.
 *
 * Also omits the cookie-parser dependency that public-test-app.ts requires but
 * which is not installed in the current monorepo node_modules.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, getStorageToken } from '@nestjs/throttler';
import SuperTest from 'supertest';
import { AppModule } from '../../../../src/app.module';
import { FcmService } from '../../../../src/infrastructure/mail/fcm.service';
import { SmtpService } from '../../../../src/infrastructure/mail/smtp.service';
import { EmbeddingAdapter } from '../../../../src/infrastructure/ai/embedding.adapter';
import { ChatAdapter } from '../../../../src/infrastructure/ai/chat.adapter';
import { SemanticSearchHandler } from '../../../../src/modules/ai/semantic-search/semantic-search.handler';
import { MinioService } from '../../../../src/infrastructure/storage/minio.service';
import { MoyasarApiClient } from '../../../../src/modules/finance/moyasar-api/moyasar-api.client';
import { testPrisma } from '../../../setup/db.setup';
import * as bcrypt from 'bcryptjs';

export const TEST_JWT_ACCESS_SECRET = 'test-access-secret-32chars-min';
const TEST_JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-min';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://deqah:deqah_dev_password@127.0.0.1:5999/deqah_test?schema=public';

const CONFIG_MAP: Record<string, string | number> = {
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_ACCESS_SECRET: TEST_JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: TEST_JWT_REFRESH_SECRET,
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  JWT_CLIENT_ACCESS_SECRET: 'test-client-access-secret-32chars',
  JWT_CLIENT_REFRESH_SECRET: 'test-client-refresh-secret-32chars',
  JWT_CLIENT_ACCESS_TTL: '15m',
  JWT_CLIENT_REFRESH_TTL: '30d',
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
  SMS_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  ZOOM_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
  MOYASAR_TENANT_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  EMAIL_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
  MOYASAR_PLATFORM_SECRET_KEY: 'test-moyasar-platform-key',
  MOYASAR_PLATFORM_WEBHOOK_SECRET: 'test-moyasar-webhook-secret',
  ADMIN_HOSTS: 'admin.deqah.app',
  // Tenant middleware: 'off' so TenantResolverMiddleware fast-paths for all routes.
  TENANT_ENFORCEMENT: 'off',
  DEFAULT_ORGANIZATION_ID: '00000000-0000-0000-0000-000000000001',
};

let cachedApp: INestApplication | null = null;

export interface VerticalsTestApp {
  app: INestApplication;
  request: SuperTest.Agent;
}

export async function createVerticalsTestApp(): Promise<VerticalsTestApp> {
  // Set process.env for ConfigModule (read during module init before mock takes over)
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '5380';
  process.env.JWT_ACCESS_SECRET = TEST_JWT_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_JWT_REFRESH_SECRET;
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.JWT_CLIENT_ACCESS_SECRET = 'test-client-access-secret-32chars';
  process.env.JWT_CLIENT_REFRESH_SECRET = 'test-client-refresh-secret-32chars';
  process.env.JWT_CLIENT_ACCESS_TTL = '15m';
  process.env.JWT_CLIENT_REFRESH_TTL = '30d';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.FCM_PROJECT_ID = 'test-project';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_PORT = '9000';
  process.env.MINIO_ACCESS_KEY = 'minioadmin';
  process.env.MINIO_SECRET_KEY = 'minioadmin123';
  process.env.MINIO_BUCKET = 'deqah';
  process.env.TENANT_ENFORCEMENT = 'off';
  process.env.DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
  process.env.LICENSE_SERVER_URL = 'http://localhost:9999';
  process.env.SMS_PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.ZOOM_PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64');
  process.env.MOYASAR_TENANT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
  process.env.EMAIL_PROVIDER_ENCRYPTION_KEY =
    process.env.EMAIL_PROVIDER_ENCRYPTION_KEY ??
    Buffer.alloc(32, 4).toString('base64');

  // Ensure the baseline admin user exists (JwtStrategy looks up user in DB)
  const passwordHash = await bcrypt.hash('Test@1234', 10);
  await testPrisma.user.upsert({
    where: { email: 'admin@e2e.test' },
    update: {},
    create: {
      id: 'user-admin-e2e',
      email: 'admin@e2e.test',
      name: 'Admin E2E',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  if (cachedApp) {
    return { app: cachedApp, request: SuperTest(cachedApp.getHttpServer()) };
  }

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideProvider(getStorageToken())
    .useValue({
      increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
    })
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string) => CONFIG_MAP[key],
      getOrThrow: (key: string) => {
        const val = CONFIG_MAP[key];
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
      createPayment: jest.fn().mockResolvedValue({}),
      toPaymentStatus: jest.fn().mockReturnValue('COMPLETED' as never),
      toPaymentMethod: jest.fn().mockReturnValue('ONLINE_CARD' as never),
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  cachedApp = app;

  return { app, request: SuperTest(app.getHttpServer()) };
}

export async function closeVerticalsTestApp(): Promise<void> {
  if (cachedApp) {
    await cachedApp.close();
    cachedApp = null;
  }
}
