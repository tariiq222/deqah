import './instrument';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { LoggingInterceptor, AuditInterceptor, TenantGucInterceptor } from './common/interceptors';
import { PrismaService } from './infrastructure/database';
import { TenantContextService } from './common/tenant/tenant-context.service';
import { ClsService } from 'nestjs-cls';
import { configureCors } from './cors';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the untouched request body buffer on req.rawBody,
  // required by webhook handlers (Moyasar, etc.) for HMAC signature verification.
  // Without this the body is JSON-parsed before the handler sees it and the
  // signature computed over the raw bytes would never match.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Honor X-Forwarded-For from the upstream Nginx so req.ip is the real client IP (throttler + audit logs depend on this).
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  configureCors(app);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalInterceptors(new AuditInterceptor(app.get(PrismaService), app.get(TenantContextService)));
  if (process.env.RLS_GUC_INTERCEPTOR_ENABLED === 'true') {
    app.useGlobalInterceptors(
      new TenantGucInterceptor(app.get(PrismaService), app.get(TenantContextService), app.get(ClsService)),
    );
  }
  // ─── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Deqah API')
    .setDescription('Deqah — نظام إدارة الحجوزات والمواعيد — dashboard & mobile API')
    .setVersion('2.0')
    .setContact('Deqah Engineering', 'https://deqah.app', 'dev@deqah.app')
    .setLicense('Proprietary', 'https://deqah.app/license')
    .addBearerAuth()
    .addServer('http://localhost:5100', 'Local dev')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Expose the interactive UI only outside production — the OpenAPI JSON
  // snapshot (WRITE_OPENAPI_SPEC=1) is still generated in CI regardless.
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  if (process.env.WRITE_OPENAPI_SPEC === '1') {
    const outPath = resolve(__dirname, '../openapi.json');
    // Deterministic key order so git diffs stay readable: recursively sort
    // every object's keys before serializing. JSON.stringify's replacer
    // cannot do this (arrays act as a global property allowlist and drop
    // nested keys), so we walk the tree ourselves.
    const sortKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sortKeys);
      if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = sortKeys((value as Record<string, unknown>)[key]);
            return acc;
          }, {});
      }
      return value;
    };
    const ordered = JSON.stringify(sortKeys(document), null, 2);
    writeFileSync(outPath, ordered, 'utf-8');
    Logger.log(`OpenAPI spec written to ${outPath}`, 'Bootstrap');
    await app.close();
    return;
  }

  // ─── Production secret assertion (defense-in-depth) ───────────────────────
  // Joi validates at module load, but this runs after DI is fully wired so any
  // late-binding env override (e.g. vault agent sidecar) is also caught.
  const config = app.get(ConfigService);
  if (config.get<string>('NODE_ENV') === 'production') {
    const banned = ['Admin@2026', 'REPLACE_ME', 'CHANGE_ME'];
    for (const key of [
      'SMS_PROVIDER_ENCRYPTION_KEY',
      'ZOOM_PROVIDER_ENCRYPTION_KEY',
      'MOYASAR_TENANT_ENCRYPTION_KEY',
      'EMAIL_PROVIDER_ENCRYPTION_KEY',
      'ZOHO_PROVIDER_ENCRYPTION_KEY',
      'SUPER_ADMIN_PASSWORD',
    ]) {
      const v = config.get<string>(key);
      if (!v || banned.includes(v)) {
        throw new Error(
          `Refusing to boot: ${key} is missing or set to a known dev placeholder`,
        );
      }
    }
  }

  const port = Number(process.env.PORT ?? 5100);
  await app.listen(port);
  Logger.log(`Deqah Backend listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
