/**
 * Subdomain isolation — /public/branding
 *
 * Proves that X-Forwarded-Host subdomain routing resolves to the correct
 * tenant and that two seeded organisations do NOT bleed branding into each
 * other.
 *
 * Uses a dedicated app instance (not the shared createTestApp cache) so that
 * PLATFORM_ROOT_DOMAIN is guaranteed to be set before the module compiles and
 * SubdomainResolverService reads it from ConfigService.
 */
import SuperTest from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { FcmService } from '../../../src/infrastructure/mail/fcm.service';
import { SmtpService } from '../../../src/infrastructure/mail/smtp.service';
import { MinioService } from '../../../src/infrastructure/storage/minio.service';
import { EmbeddingAdapter } from '../../../src/infrastructure/ai/embedding.adapter';
import { ChatAdapter } from '../../../src/infrastructure/ai/chat.adapter';
import { SemanticSearchHandler } from '../../../src/modules/ai/semantic-search/semantic-search.handler';
import { testPrisma } from '../../setup/db.setup';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://deqah:deqah_dev_password@127.0.0.1:5999/deqah_test?schema=public';

describe('Subdomain isolation — /public/branding', () => {
  let app: INestApplication;
  let orgAId: string;
  let orgBId: string;
  const stamp = Date.now();
  const slugA = `sub-iso-a-${stamp}`;
  const slugB = `sub-iso-b-${stamp}`;

  beforeAll(async () => {
    // Must be set before Test.createTestingModule so SubdomainResolverService
    // reads it from the real ConfigService during its constructor.
    process.env.PLATFORM_ROOT_DOMAIN = 'deqah.net';
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
    process.env.REDIS_PORT = process.env.REDIS_PORT ?? '5380';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-32chars-min';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-min';
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '30d';
    process.env.JWT_CLIENT_ACCESS_SECRET = 'test-client-access-secret-32chars';
    process.env.JWT_CLIENT_REFRESH_SECRET = 'test-client-refresh-secret-32chars';
    process.env.JWT_CLIENT_ACCESS_TTL = '15m';
    process.env.JWT_CLIENT_REFRESH_TTL = '30d';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.FCM_PROJECT_ID = '';
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.LICENSE_SERVER_URL = 'http://localhost:9999';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PORT = '9000';
    process.env.MINIO_ACCESS_KEY = 'minioadmin';
    process.env.MINIO_SECRET_KEY = 'minioadmin123';
    process.env.MINIO_BUCKET = 'deqah';
    process.env.SMS_PROVIDER_ENCRYPTION_KEY =
      process.env.SMS_PROVIDER_ENCRYPTION_KEY ?? Buffer.alloc(32, 1).toString('base64');
    process.env.ZOOM_PROVIDER_ENCRYPTION_KEY =
      process.env.ZOOM_PROVIDER_ENCRYPTION_KEY ?? Buffer.alloc(32, 2).toString('base64');
    process.env.MOYASAR_TENANT_ENCRYPTION_KEY =
      process.env.MOYASAR_TENANT_ENCRYPTION_KEY ?? Buffer.alloc(32, 3).toString('base64');
    process.env.EMAIL_PROVIDER_ENCRYPTION_KEY =
      process.env.EMAIL_PROVIDER_ENCRYPTION_KEY ?? Buffer.alloc(32, 4).toString('base64');
    process.env.ZOHO_PROVIDER_ENCRYPTION_KEY =
      process.env.ZOHO_PROVIDER_ENCRYPTION_KEY ?? Buffer.alloc(32, 5).toString('base64');
    process.env.MOYASAR_PLATFORM_SECRET_KEY = 'test-moyasar-platform-key';
    process.env.MOYASAR_PLATFORM_WEBHOOK_SECRET = 'test-moyasar-webhook-secret';
    process.env.TENANT_ENFORCEMENT = 'strict';
    process.env.DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FcmService)
      .useValue({ sendPush: jest.fn(), sendMulticast: jest.fn(), isAvailable: () => false })
      .overrideProvider(SmtpService)
      .useValue({
        send: jest.fn().mockResolvedValue(undefined),
        sendTemplate: jest.fn().mockResolvedValue(undefined),
        isAvailable: () => false,
        sendMail: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(MinioService)
      .useValue({
        uploadFile: jest.fn().mockResolvedValue('http://localhost:9000/deqah/mocked-key'),
        deleteFile: jest.fn().mockResolvedValue(undefined),
        getSignedUrl: jest.fn().mockResolvedValue('http://localhost:9000/deqah/mocked-key?sig=x'),
        fileExists: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(EmbeddingAdapter)
      .useValue({ isAvailable: () => true, embed: jest.fn().mockResolvedValue([new Array(1536).fill(0)]) })
      .overrideProvider(SemanticSearchHandler)
      .useValue({ execute: jest.fn().mockResolvedValue([]) })
      .overrideProvider(ChatAdapter)
      .useValue({
        isAvailable: () => true,
        complete: jest.fn().mockResolvedValue('test reply'),
        stream: jest.fn(async function* () { yield 'test'; }),
      })
      .compile();

    app = mod.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.init();

    // Seed Org A with a red primary colour.
    const orgA = await testPrisma.organization.upsert({
      where: { slug: slugA },
      update: {},
      create: { slug: slugA, nameAr: 'منظمة نطاق أ', status: 'ACTIVE' },
      select: { id: true },
    });
    orgAId = orgA.id;
    await testPrisma.brandingConfig.upsert({
      where: { organizationId: orgAId },
      update: { colorPrimary: '#ff0000' },
      create: {
        organizationId: orgAId,
        organizationNameAr: 'منظمة نطاق أ',
        colorPrimary: '#ff0000',
      },
    });

    // Seed Org B with a green primary colour.
    const orgB = await testPrisma.organization.upsert({
      where: { slug: slugB },
      update: {},
      create: { slug: slugB, nameAr: 'منظمة نطاق ب', status: 'ACTIVE' },
      select: { id: true },
    });
    orgBId = orgB.id;
    await testPrisma.brandingConfig.upsert({
      where: { organizationId: orgBId },
      update: { colorPrimary: '#00ff00' },
      create: {
        organizationId: orgBId,
        organizationNameAr: 'منظمة نطاق ب',
        colorPrimary: '#00ff00',
      },
    });
  });

  afterAll(async () => {
    // Clean up branding first (FK child), then org.
    await testPrisma.brandingConfig.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId].filter(Boolean) } },
    });
    await testPrisma.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId].filter(Boolean) } },
    });
    if (app) await app.close();
  });

  it('returns Org A branding when X-Forwarded-Host is <slugA>.deqah.net', async () => {
    const res = await SuperTest(app.getHttpServer())
      .get('/public/branding')
      .set('X-Forwarded-Host', `${slugA}.deqah.net`);
    expect(res.status).toBe(200);
    expect(res.body.colorPrimary).toBe('#ff0000');
  });

  it('returns Org B branding when X-Forwarded-Host is <slugB>.deqah.net', async () => {
    const res = await SuperTest(app.getHttpServer())
      .get('/public/branding')
      .set('X-Forwarded-Host', `${slugB}.deqah.net`);
    expect(res.status).toBe(200);
    expect(res.body.colorPrimary).toBe('#00ff00');
  });

  it('Org A colour does not appear when requesting Org B subdomain', async () => {
    const res = await SuperTest(app.getHttpServer())
      .get('/public/branding')
      .set('X-Forwarded-Host', `${slugB}.deqah.net`);
    expect(res.status).toBe(200);
    expect(res.body.colorPrimary).not.toBe('#ff0000');
  });

  it('reserved subdomain (admin.deqah.net) does not resolve to either seeded tenant', async () => {
    const res = await SuperTest(app.getHttpServer())
      .get('/public/branding')
      .set('X-Forwarded-Host', 'admin.deqah.net');
    // Reserved subdomains return null from SubdomainResolverService.
    // The middleware allows public routes through even with no resolved org.
    // The handler then falls back to the default branding shape (colorPrimary: null).
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.colorPrimary).not.toBe('#ff0000');
      expect(res.body.colorPrimary).not.toBe('#00ff00');
    }
  });
});
