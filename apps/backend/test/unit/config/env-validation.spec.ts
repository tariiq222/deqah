import { envValidationSchema } from '@/config/env.validation';

describe('envValidationSchema', () => {
  const ENC_KEY_32 = Buffer.alloc(32).toString('base64');

  const devEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://localhost:5432/test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_ACCESS_KEY: 'a',
    MINIO_SECRET_KEY: 'b',
    MINIO_BUCKET: 'x',
    JWT_ACCESS_SECRET: 'dev-access-secret-change-me',
    JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me',
    JWT_CLIENT_ACCESS_SECRET: 'dev-client-access-secret-change-me',
    SMS_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
    ZOOM_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
    MOYASAR_TENANT_ENCRYPTION_KEY: ENC_KEY_32,
    EMAIL_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
    ZOHO_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
    SUPER_ADMIN_PASSWORD: 'TestAdmin@2026Test!!',
  };

  it('passes minimal dev env', () => {
    const r = envValidationSchema.validate(devEnv, { abortEarly: false });
    expect(r.error).toBeUndefined();
  });

  it('rejects production env with placeholder secrets', () => {
    const env = { ...devEnv, NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
      ADMIN_HOSTS: 'admin.example.com',
      AUTHENTICA_API_KEY: 'real-key-1234567890',
      CAPTCHA_PROVIDER: 'hcaptcha',
      HCAPTCHA_SECRET: 'real-hcaptcha-secret',
      JWT_OTP_SECRET: 'a-real-otp-secret-32-bytes-or-more',
      JWT_ACCESS_SECRET: 'dev-access-secret-change-me',
      DASHBOARD_PUBLIC_URL: 'https://app.example.com',
      PUBLIC_WEBSITE_URL: 'https://example.com',
      API_PUBLIC_URL: 'https://api.example.com',
      MOYASAR_PLATFORM_SECRET_KEY: 'sk_live_platform_key_test',
      MOYASAR_PLATFORM_WEBHOOK_SECRET: 'real-webhook-secret-value',
      SUPER_ADMIN_PASSWORD: 'RealSuperAdminPass2026!',
      ZOHO_OAUTH_CLIENT_ID: 'zoho-client-id',
      ZOHO_OAUTH_CLIENT_SECRET: 'zoho-client-secret',
      ZOHO_OAUTH_REDIRECT_URI: 'https://api.example.com/zoho/callback',
      PLATFORM_ROOT_DOMAIN: 'deqah.net',
    };
    const r = envValidationSchema.validate(env, { abortEarly: false });
    expect(r.error).toBeDefined();
    expect(r.error!.message).toMatch(/dev placeholder|change-me|invalid/i);
  });

  it('passes production env with real secrets', () => {
    const env = {
      NODE_ENV: 'production',
      // P0 RLS cutover (2026-05-09): prod must use deqah_app + interceptor on
      DATABASE_URL: 'postgresql://deqah_app:pass@localhost:5432/test',
      RLS_GUC_INTERCEPTOR_ENABLED: 'true',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9000',
      MINIO_ACCESS_KEY: 'a',
      MINIO_SECRET_KEY: 'b',
      MINIO_BUCKET: 'x',
      JWT_ACCESS_SECRET: 'a-real-jwt-secret-32-bytes-long-here',
      JWT_REFRESH_SECRET: 'a-real-refresh-secret-32-bytes-long',
      JWT_CLIENT_ACCESS_SECRET: 'a-real-client-secret-32-bytes-long',
      JWT_OTP_SECRET: 'a-real-otp-secret-32-bytes-or-more',
      SMS_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
      ZOOM_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
      MOYASAR_TENANT_ENCRYPTION_KEY: ENC_KEY_32,
      EMAIL_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
      ZOHO_PROVIDER_ENCRYPTION_KEY: ENC_KEY_32,
      CORS_ORIGINS: 'https://app.example.com',
      ADMIN_HOSTS: 'admin.example.com',
      AUTHENTICA_API_KEY: 'real-authentica-key-1234567890',
      CAPTCHA_PROVIDER: 'hcaptcha',
      HCAPTCHA_SECRET: 'real-hcaptcha-secret',
      DASHBOARD_PUBLIC_URL: 'https://app.example.com',
      PUBLIC_WEBSITE_URL: 'https://example.com',
      API_PUBLIC_URL: 'https://api.example.com',
      MOYASAR_PLATFORM_SECRET_KEY: 'sk_live_platform_key_test',
      MOYASAR_PLATFORM_WEBHOOK_SECRET: 'real-webhook-secret-value',
      SUPER_ADMIN_PASSWORD: 'RealSuperAdminPass2026!',
      ZOHO_OAUTH_CLIENT_ID: 'zoho-client-id-long',
      ZOHO_OAUTH_CLIENT_SECRET: 'zoho-client-secret-long',
      ZOHO_OAUTH_REDIRECT_URI: 'https://api.example.com/zoho/callback',
      PLATFORM_ROOT_DOMAIN: 'deqah.net',
    };
    const r = envValidationSchema.validate(env, { abortEarly: false });
    expect(r.error).toBeUndefined();
  });

  it('rejects production env missing AUTHENTICA_API_KEY', () => {
    const env = { ...devEnv, NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a-real-jwt-secret-32-bytes-long-here',
      JWT_REFRESH_SECRET: 'a-real-refresh-secret-32-bytes-long',
      JWT_CLIENT_ACCESS_SECRET: 'a-real-client-secret-32-bytes-long',
      JWT_OTP_SECRET: 'a-real-otp-secret-32-bytes-or-more',
      CORS_ORIGINS: 'https://app.example.com',
      ADMIN_HOSTS: 'admin.example.com',
      CAPTCHA_PROVIDER: 'hcaptcha',
      HCAPTCHA_SECRET: 'real-hcaptcha-secret',
      DASHBOARD_PUBLIC_URL: 'https://app.example.com',
      PUBLIC_WEBSITE_URL: 'https://example.com',
    };
    const r = envValidationSchema.validate(env, { abortEarly: false });
    expect(r.error).toBeDefined();
    expect(r.error!.message).toMatch(/AUTHENTICA_API_KEY/);
  });

  it('rejects production env with hcaptcha provider but missing HCAPTCHA_SECRET', () => {
    const env = { ...devEnv, NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a-real-jwt-secret-32-bytes-long-here',
      JWT_REFRESH_SECRET: 'a-real-refresh-secret-32-bytes-long',
      JWT_CLIENT_ACCESS_SECRET: 'a-real-client-secret-32-bytes-long',
      JWT_OTP_SECRET: 'a-real-otp-secret-32-bytes-or-more',
      CORS_ORIGINS: 'https://app.example.com',
      ADMIN_HOSTS: 'admin.example.com',
      AUTHENTICA_API_KEY: 'real-authentica-key-1234567890',
      CAPTCHA_PROVIDER: 'hcaptcha',
      DASHBOARD_PUBLIC_URL: 'https://app.example.com',
      PUBLIC_WEBSITE_URL: 'https://example.com',
    };
    const r = envValidationSchema.validate(env, { abortEarly: false });
    expect(r.error).toBeDefined();
    expect(r.error!.message).toMatch(/HCAPTCHA_SECRET/);
  });
});
