import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { TenantContextService, TenantContext } from '../../src/common/tenant';
import { FcmService } from '../../src/infrastructure/mail/fcm.service';
import { SmtpService } from '../../src/infrastructure/mail/smtp.service';
import { MinioService } from '../../src/infrastructure/storage/minio.service';
import { EmbeddingAdapter } from '../../src/infrastructure/ai/embedding.adapter';
import { ChatAdapter } from '../../src/infrastructure/ai/chat.adapter';
import { SemanticSearchHandler } from '../../src/modules/ai/semantic-search/semantic-search.handler';

export interface IsolationHarness {
  app: INestApplication;
  prisma: PrismaService;
  cls: ClsService;
  ctx: TenantContextService;
  createOrg: (slug: string, nameAr: string) => Promise<{ id: string }>;
  runAs: <T>(context: Partial<TenantContext>, fn: () => Promise<T>) => Promise<T>;
  cleanupOrg: (orgId: string) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Boots a real AppModule against the dev/test database. Intended for
 * cross-tenant isolation proofs — NOT for fast unit tests.
 */
export async function bootHarness(): Promise<IsolationHarness> {
  // Set all required env vars before AppModule bootstraps
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    'postgresql://deqah:deqah_dev_password@127.0.0.1:5999/deqah_test?schema=public';
  process.env.REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT ?? '5380';
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-32chars-min';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-32chars-min';
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.JWT_CLIENT_ACCESS_SECRET = 'test-client-access-secret-32chars';
  process.env.JWT_CLIENT_REFRESH_SECRET = 'test-client-refresh-secret-32chars';
  process.env.JWT_CLIENT_ACCESS_TTL = '15m';
  process.env.JWT_CLIENT_REFRESH_TTL = '30d';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.FCM_PROJECT_ID = ''; // empty → FcmService.onModuleInit() skips firebase init
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
  process.env.MOYASAR_PLATFORM_SECRET_KEY = 'test-moyasar-platform-key';
  process.env.MOYASAR_PLATFORM_WEBHOOK_SECRET = 'test-moyasar-webhook-secret';
  process.env.TENANT_ENFORCEMENT = process.env.TENANT_ENFORCEMENT ?? 'strict';
  process.env.DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
  const mod: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(FcmService)
    .useValue({ sendPush: jest.fn(), sendMulticast: jest.fn(), isAvailable: () => false })
    .overrideProvider(SmtpService)
    .useValue({ send: jest.fn().mockResolvedValue(undefined), sendTemplate: jest.fn().mockResolvedValue(undefined) })
    .overrideProvider(MinioService)
    .useValue({ uploadFile: jest.fn().mockResolvedValue('http://localhost:9000/deqah/mocked-key'), deleteFile: jest.fn(), getSignedUrl: jest.fn().mockResolvedValue('http://localhost:9000/deqah/mocked-key?sig=x'), fileExists: jest.fn().mockResolvedValue(true) })
    .overrideProvider(EmbeddingAdapter)
    .useValue({ isAvailable: () => true, embed: jest.fn().mockResolvedValue([new Array(1536).fill(0)]) })
    .overrideProvider(SemanticSearchHandler)
    .useValue({ execute: jest.fn().mockResolvedValue([]) })
    .overrideProvider(ChatAdapter)
    .useValue({ isAvailable: () => true, complete: jest.fn().mockResolvedValue('test reply'), stream: jest.fn(async function* () { yield 'test'; }) })
    .compile();

  const app = mod.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);
  const cls = app.get(ClsService);
  const ctx = app.get(TenantContextService);

  const createOrg = async (slug: string, nameAr: string) => {
    const row = await prisma.organization.upsert({
      where: { slug },
      update: {},
      create: { slug, nameAr, status: 'ACTIVE' },
      select: { id: true },
    });
    return row;
  };

  const runAs = <T>(partial: Partial<TenantContext>, fn: () => Promise<T>): Promise<T> =>
    cls.run(() => {
      ctx.set({
        organizationId: partial.organizationId ?? '',
        membershipId: partial.membershipId ?? '',
        id: partial.id ?? '',
        role: partial.role ?? 'ADMIN',
        isSuperAdmin: partial.isSuperAdmin === true,
      });
      return fn();
    });

  const cleanupOrg = async (orgId: string) => {
    await runAs({ organizationId: orgId }, async () => {
      await prisma.membership.deleteMany({ where: { organizationId: orgId } });
      await prisma.refreshToken.deleteMany({ where: { organizationId: orgId } });
      await prisma.customRole.deleteMany({ where: { organizationId: orgId } });
      await prisma.permission.deleteMany({ where: { organizationId: orgId } });
    });
    await prisma.organization.delete({ where: { id: orgId } });
  };

  return {
    app,
    prisma,
    cls,
    ctx,
    createOrg,
    runAs,
    cleanupOrg,
    close: async () => {
      await app.close();
    },
  };
}
