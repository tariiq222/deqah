// Boot-time test environment defaults.
// `??=` only assigns when the var is unset, so the real .env (and CI overrides)
// always win. Keep encryption keys deterministic per-test-run so cipher-text
// from one suite doesn't accidentally satisfy another.

process.env.TENANT_ENFORCEMENT ??= 'permissive';
process.env.DEFAULT_ORGANIZATION_ID ??= '00000000-0000-0000-0000-000000000001';
process.env.ADMIN_HOSTS ??= 'localhost,admin.deqah.app';

process.env.DATABASE_URL ??= 'postgresql://deqah:deqah_dev_password@127.0.0.1:5999/deqah_test?schema=public';
process.env.REDIS_HOST ??= 'localhost';
process.env.REDIS_PORT ??= '5380';
process.env.MINIO_ENDPOINT ??= 'localhost';
process.env.MINIO_PORT ??= '9000';
process.env.MINIO_ACCESS_KEY ??= 'minioadmin';
process.env.MINIO_SECRET_KEY ??= 'minioadmin123';
process.env.MINIO_BUCKET ??= 'deqah';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-32chars-min';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-32chars-min';
process.env.JWT_CLIENT_ACCESS_SECRET ??= 'test-client-access-secret-32chars';
process.env.SUPER_ADMIN_PASSWORD ??= 'TestAdmin@2026Test!!';
process.env.SMS_PROVIDER_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
process.env.ZOOM_PROVIDER_ENCRYPTION_KEY ??= Buffer.alloc(32, 2).toString('base64');
process.env.ZOHO_PROVIDER_ENCRYPTION_KEY ??= Buffer.alloc(32, 5).toString('base64');
process.env.MOYASAR_TENANT_ENCRYPTION_KEY ??= Buffer.alloc(32, 3).toString('base64');
process.env.EMAIL_PROVIDER_ENCRYPTION_KEY ??= Buffer.alloc(32, 4).toString('base64');
// Phase 7 — invoice PDF renderer reads platform identity at module init.
process.env.PLATFORM_VAT_NUMBER ??= '300000000000003';
process.env.PLATFORM_COMPANY_NAME_AR ??= 'منصة دِقة';
process.env.PLATFORM_COMPANY_NAME_EN ??= 'Deqah Platform';
process.env.PLATFORM_COMPANY_ADDRESS ??= 'Riyadh, Saudi Arabia';
process.env.MINIO_INVOICE_BUCKET ??= 'deqah-invoices';
