import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import SuperTest from 'supertest';
import { AppModule } from '../../src/app.module';
import { FcmService } from '../../src/infrastructure/mail/fcm.service';
import { SmtpService } from '../../src/infrastructure/mail/smtp.service';
import { EmbeddingAdapter } from '../../src/infrastructure/ai/embedding.adapter';
import { ChatAdapter } from '../../src/infrastructure/ai/chat.adapter';
import { SemanticSearchHandler } from '../../src/modules/ai/semantic-search/semantic-search.handler';
import { MinioService } from '../../src/infrastructure/storage/minio.service';
import { CAPTCHA_VERIFIER } from '../../src/modules/comms/contact-messages/captcha.verifier';
import { ensureTestUsers } from './auth.helper';

const TEST_JWT_ACCESS_SECRET = 'test-access-secret-32chars-min';
const TEST_JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-min';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://deqah:deqah_dev_password@127.0.0.1:5999/deqah_test?schema=public';

type TestTenantEnforcement = 'permissive' | 'strict';

const appCache = new Map<string, INestApplication>();

export async function createTestApp(
  options: { tenantEnforcement?: TestTenantEnforcement; globalPrefix?: boolean } = {},
): Promise<{
  app: INestApplication;
  request: SuperTest.Agent;
}> {
  const tenantEnforcement = options.tenantEnforcement ?? 'permissive';
  const globalPrefix = options.globalPrefix === true;
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT ?? '5380';
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
  process.env.JWT_CLIENT_ACCESS_SECRET = 'test-client-access-secret-32chars';
  process.env.JWT_CLIENT_REFRESH_SECRET = 'test-client-refresh-secret-32chars';
  process.env.JWT_CLIENT_ACCESS_TTL = '15m';
  process.env.JWT_CLIENT_REFRESH_TTL = '30d';
  process.env.TENANT_ENFORCEMENT = tenantEnforcement;
  process.env.SMS_PROVIDER_ENCRYPTION_KEY =
    process.env.SMS_PROVIDER_ENCRYPTION_KEY ??
    Buffer.alloc(32, 1).toString('base64');
  process.env.ZOOM_PROVIDER_ENCRYPTION_KEY =
    process.env.ZOOM_PROVIDER_ENCRYPTION_KEY ??
    Buffer.alloc(32, 2).toString('base64');
  process.env.MOYASAR_TENANT_ENCRYPTION_KEY =
    process.env.MOYASAR_TENANT_ENCRYPTION_KEY ??
    Buffer.alloc(32, 3).toString('base64');
  process.env.EMAIL_PROVIDER_ENCRYPTION_KEY =
    process.env.EMAIL_PROVIDER_ENCRYPTION_KEY ??
    Buffer.alloc(32, 4).toString('base64');
  process.env.ZOHO_PROVIDER_ENCRYPTION_KEY =
    process.env.ZOHO_PROVIDER_ENCRYPTION_KEY ??
    Buffer.alloc(32, 5).toString('base64');

  await ensureTestUsers();

  const cacheKey = `tenant=${tenantEnforcement};prefix=${globalPrefix ? 'api/v1' : 'none'}`;
  const cachedApp = appCache.get(cacheKey);
  if (cachedApp) {
    return { app: cachedApp, request: SuperTest(cachedApp.getHttpServer()) };
  }

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string) => {
        const map: Record<string, string> = {
          DATABASE_URL: TEST_DATABASE_URL,
          JWT_ACCESS_SECRET: TEST_JWT_ACCESS_SECRET,
          JWT_REFRESH_SECRET: TEST_JWT_REFRESH_SECRET,
          JWT_ACCESS_TTL: '15m',
          JWT_REFRESH_TTL: '30d',
          JWT_CLIENT_ACCESS_SECRET: 'test-client-access-secret-32chars',
          JWT_CLIENT_REFRESH_SECRET: 'test-client-refresh-secret-32chars',
          JWT_CLIENT_ACCESS_TTL: '15m',
          JWT_CLIENT_REFRESH_TTL: '30d',
          REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
          REDIS_PORT: process.env.REDIS_PORT ?? '5380',
          OPENAI_API_KEY: 'test-key',
          OPENROUTER_API_KEY: 'test-key',
          FCM_PROJECT_ID: 'test-project',
          SMTP_HOST: 'localhost',
          SMTP_PORT: '1025',
          LICENSE_SERVER_URL: 'http://localhost:9999',
          MINIO_ENDPOINT: 'localhost',
          MINIO_PORT: '9000',
          MINIO_ACCESS_KEY: 'minioadmin',
          MINIO_SECRET_KEY: 'minioadmin123',
          MINIO_BUCKET: 'deqah',
          SMS_PROVIDER_ENCRYPTION_KEY: process.env.SMS_PROVIDER_ENCRYPTION_KEY!,
          ZOOM_PROVIDER_ENCRYPTION_KEY: process.env.ZOOM_PROVIDER_ENCRYPTION_KEY!,
          MOYASAR_TENANT_ENCRYPTION_KEY: process.env.MOYASAR_TENANT_ENCRYPTION_KEY!,
          EMAIL_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
          ZOHO_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
          MOYASAR_PLATFORM_SECRET_KEY: 'test-moyasar-platform-key',
          MOYASAR_PLATFORM_WEBHOOK_SECRET: 'test-moyasar-webhook-secret',
          ADMIN_HOSTS: process.env.ADMIN_HOSTS!,
          TENANT_ENFORCEMENT: tenantEnforcement,
          DEFAULT_ORGANIZATION_ID: '00000000-0000-0000-0000-000000000001',
        };
        return map[key];
      },
      getOrThrow: (key: string) => {
        const map: Record<string, string | undefined> = {
          DATABASE_URL: TEST_DATABASE_URL,
          JWT_ACCESS_SECRET: TEST_JWT_ACCESS_SECRET,
          JWT_REFRESH_SECRET: TEST_JWT_REFRESH_SECRET,
          JWT_ACCESS_TTL: '15m',
          JWT_REFRESH_TTL: '30d',
          JWT_CLIENT_ACCESS_SECRET: 'test-client-access-secret-32chars',
          JWT_CLIENT_REFRESH_SECRET: 'test-client-refresh-secret-32chars',
          JWT_CLIENT_ACCESS_TTL: '15m',
          JWT_CLIENT_REFRESH_TTL: '30d',
          REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
          REDIS_PORT: process.env.REDIS_PORT ?? '5380',
          OPENAI_API_KEY: 'test-key',
          OPENROUTER_API_KEY: 'test-key',
          FCM_PROJECT_ID: 'test-project',
          SMTP_HOST: 'localhost',
          SMTP_PORT: '1025',
          LICENSE_SERVER_URL: 'http://localhost:9999',
          MINIO_ENDPOINT: 'localhost',
          MINIO_PORT: '9000',
          MINIO_ACCESS_KEY: 'minioadmin',
          MINIO_SECRET_KEY: 'minioadmin123',
          MINIO_BUCKET: 'deqah',
          SMS_PROVIDER_ENCRYPTION_KEY: process.env.SMS_PROVIDER_ENCRYPTION_KEY!,
          ZOOM_PROVIDER_ENCRYPTION_KEY: process.env.ZOOM_PROVIDER_ENCRYPTION_KEY!,
          MOYASAR_TENANT_ENCRYPTION_KEY: process.env.MOYASAR_TENANT_ENCRYPTION_KEY!,
          EMAIL_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
          ZOHO_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
          MOYASAR_PLATFORM_SECRET_KEY: 'test-moyasar-platform-key',
          MOYASAR_PLATFORM_WEBHOOK_SECRET: 'test-moyasar-webhook-secret',
          ADMIN_HOSTS: process.env.ADMIN_HOSTS!,
          TENANT_ENFORCEMENT: tenantEnforcement,
          DEFAULT_ORGANIZATION_ID: '00000000-0000-0000-0000-000000000001',
        };
        const val = map[key];
        if (!val) throw new Error(`Config key ${key} not found`);
        return val;
      },
    })
    .overrideProvider(FcmService)
    .useValue({ sendPush: jest.fn().mockResolvedValue(undefined) })
    .overrideProvider(SmtpService)
    .useValue({ send: jest.fn().mockResolvedValue(undefined), sendTemplate: jest.fn().mockResolvedValue(undefined), isAvailable: () => false, sendMail: jest.fn().mockResolvedValue(undefined) })
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
    .overrideProvider(CAPTCHA_VERIFIER)
    .useValue({ verify: async () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  if (globalPrefix) {
    app.setGlobalPrefix('api/v1');
  }
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  appCache.set(cacheKey, app);

  return { app, request: SuperTest(app.getHttpServer()) };
}

export async function closeTestApp(): Promise<void> {
  for (const app of appCache.values()) {
    await app.close();
  }
  appCache.clear();
}
