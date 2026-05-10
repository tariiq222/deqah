import * as Joi from 'joi';

// TEMPORARY (2026-05-07): RELAX_PROD_VALIDATION=true downgrades Zoho + hCaptcha to optional in prod
// so the platform can boot before real credentials land. Remove once those keys are populated.

/**
 * Boot-time validation for process.env.
 *
 * Rules:
 * - Only variables declared here are trusted. Unknown keys pass through
 *   but are not validated.
 * - NestJS ConfigModule calls this schema once at startup and aborts the
 *   app if any required variable is missing or malformed.
 * - Keep this file flat: one Joi schema, no typed getters. Typed config
 *   namespaces are added per bounded context when that BC is implemented.
 *
 * Spec reference: apps/backend/.env.example
 */
export const envValidationSchema = Joi.object({
  // Runtime
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().port().default(5100),

  // CORS — comma-separated list of allowed origins.
  // In production MUST be set to the dashboard + mobile origins (no localhost).
  CORS_ORIGINS: Joi.string().allow('').optional(),

  // Database (Prisma)
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  APP_DB_USER: Joi.string().optional(),
  APP_DB_PASSWORD: Joi.string().optional(),
  RLS_GUC_INTERCEPTOR_ENABLED: Joi.string().valid('true', 'false').default('false'),

  // Redis (BullMQ + cache + token blacklist)
  REDIS_HOST: Joi.string().hostname().required(),
  REDIS_PORT: Joi.number().port().required(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),

  // MinIO (object storage)
  MINIO_ENDPOINT: Joi.string().hostname().required(),
  MINIO_PORT: Joi.number().port().required(),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_BUCKET: Joi.string().required(),
  MINIO_USE_SSL: Joi.boolean().default(false),

  // JWT (Identity BC)
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  // Refresh tokens are opaque DB-stored tokens (bcrypt selector pattern); JWT_REFRESH_SECRET is reserved for future JWT-signed refresh token migration.
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  // Client JWT — separate namespace for website clients
  JWT_CLIENT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_CLIENT_ACCESS_TTL: Joi.string().default('15m'),

  // License Server (Platform BC) — optional until Phase 3
  LICENSE_SERVER_URL: Joi.string().uri().allow('').optional(),
  LICENSE_KEY: Joi.string().allow('').optional(),

  // FCM (Comms BC) — optional until Phase 9
  FCM_PROJECT_ID: Joi.string().allow('').optional(),
  FCM_CLIENT_EMAIL: Joi.string().email().allow('').optional(),
  FCM_PRIVATE_KEY: Joi.string().allow('').optional(),

  // SMTP (Comms BC) — optional until Phase 9
  SMTP_HOST: Joi.string().hostname().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().email().allow('').optional(),

  // OpenAI (AI BC — embeddings only) — optional until Phase 11
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  OPENAI_EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),

  // OpenRouter (AI BC — chat/completion) — optional until Phase 11
  OPENROUTER_API_KEY: Joi.string().allow('').optional(),
  OPENROUTER_BASE_URL: Joi.string().uri().default('https://openrouter.ai/api/v1'),
  OPENROUTER_CHAT_MODEL: Joi.string().default('anthropic/claude-3.5-haiku'),

  // Per-tenant Moyasar AES-256-GCM key — REQUIRED; 32 raw bytes base64-encoded (ASCII length 44).
  // Used to wrap each tenant's MoyasarPublishableKey + secretKey at rest.
  MOYASAR_TENANT_ENCRYPTION_KEY: Joi.string().base64().length(44).required(),

  // Multi-tenancy — default `strict` as of SaaS-02h.
  //   strict     → platform default. Any scoped query without CLS org throws.
  //   permissive → falls back to DEFAULT_ORGANIZATION_ID. Dev-only.
  //   off        → no scoping. Legacy single-tenant mode. Never in multi-tenant prod.
  TENANT_ENFORCEMENT: Joi.string().valid('off', 'permissive', 'strict').default('strict'),
  DEFAULT_ORGANIZATION_ID: Joi.string().uuid().default('00000000-0000-0000-0000-000000000001'),

  // SMS per-tenant (SaaS-02g-sms) — encryption key is REQUIRED; 32 raw bytes base64-encoded (ASCII length 44).
  // Webhook base URL is the public origin registered with providers for DLR callbacks.
  SMS_PROVIDER_ENCRYPTION_KEY: Joi.string().base64().length(44).required(),
  ZOOM_PROVIDER_ENCRYPTION_KEY: Joi.string().base64().length(44).required(),
  // Email provider per-tenant encryption key — 32 raw bytes base64-encoded (ASCII length 44).
  EMAIL_PROVIDER_ENCRYPTION_KEY: Joi.string().base64().length(44).required(),
  // Zoho Invoice integration (Phase Z) — encrypts the per-tenant OAuth refresh
  // token + zoho_organization_id + webhook secret stored in `Integration.config`.
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ZOHO_PROVIDER_ENCRYPTION_KEY: process.env.RELAX_PROD_VALIDATION === 'true'
    ? Joi.string().base64().length(44).allow('').optional()
    : Joi.string().base64().length(44).required(),
  // Shared OAuth client used by Deqah's Zoho integration. Same client_id/secret
  // serves all tenants — Zoho rate-limits per Zoho organization, not per OAuth
  // client, so pooling is safe. Required in production; optional in dev so a
  // developer who hasn't created a Zoho client can still boot the app.
  ZOHO_OAUTH_CLIENT_ID: process.env.RELAX_PROD_VALIDATION === 'true'
    ? Joi.string().allow('').optional()
    : Joi.when('NODE_ENV', {
        is: 'production',
        then: Joi.string().min(8).required(),
        otherwise: Joi.string().allow('').optional(),
      }),
  ZOHO_OAUTH_CLIENT_SECRET: process.env.RELAX_PROD_VALIDATION === 'true'
    ? Joi.string().allow('').optional()
    : Joi.when('NODE_ENV', {
        is: 'production',
        then: Joi.string().min(8).required(),
        otherwise: Joi.string().allow('').optional(),
      }),
  // Public origin used to build the Zoho OAuth redirect URI. Must be HTTPS in
  // prod; localhost in dev.
  ZOHO_OAUTH_REDIRECT_URI: process.env.RELAX_PROD_VALIDATION === 'true'
    ? Joi.string().uri().allow('').optional()
    : Joi.when('NODE_ENV', {
        is: 'production',
        then: Joi.string().uri({ scheme: ['https'] }).required(),
        otherwise: Joi.string().uri().allow('').optional(),
      }),
  // SaaS→tenant invoicing: Deqah's own Zoho organization. All optional so
  // self-hosters who don't use Zoho for SaaS billing can leave them blank.
  ZOHO_PLATFORM_ORGANIZATION_ID: Joi.string().allow('').optional(),
  ZOHO_PLATFORM_REFRESH_TOKEN: Joi.string().allow('').optional(),
  ZOHO_PLATFORM_DC: Joi.string()
    .valid('com', 'sa', 'eu', 'in', 'au', 'jp', 'ca')
    .default('sa'),
  ZOHO_PLATFORM_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  SMS_WEBHOOK_URL_BASE: Joi.string().uri().allow('').optional(),

  // Super-admin bootstrap password. Must be changed before production.
  // Min 16 chars; placeholder values ('Admin@2026', 'admin', 'password') rejected in production.
  SUPER_ADMIN_PASSWORD: Joi.string().min(16).when('NODE_ENV', {
    is: 'production',
    then: Joi.required().disallow('Admin@2026', 'admin', 'password'),
    otherwise: Joi.string().min(16).allow('').optional(),
  }),

  // Throttle kill-switch. Must NEVER be enabled in production.
  THROTTLER_DISABLED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('false').default('false'),
    otherwise: Joi.string().valid('true', 'false').default('false'),
  }),

  // Billing (SaaS-04) — PLATFORM Moyasar (charges clinics for SaaS subscriptions).
  // Distinct from OrganizationPaymentConfig.moyasar* (tenant Moyasar, Plan 02e).
  // Required in production so billing webhooks are always signed and the platform
  // can charge tenants. Optional in dev/test.
  MOYASAR_PLATFORM_SECRET_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().min(16).allow('').optional(),
  }),
  MOYASAR_PLATFORM_WEBHOOK_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().min(16).allow('').optional(),
  }),
  SAAS_TRIAL_DAYS: Joi.number().integer().min(0).max(90).default(14),
  SAAS_GRACE_PERIOD_DAYS: Joi.number().integer().min(0).max(30).default(2),
  BILLING_CRON_ENABLED: Joi.boolean().default(false),
  // Slug of the plan assigned to organizations without an active subscription
  // (trial/entry tier). Must match an existing Plan.slug after seed.
  PLATFORM_DEFAULT_PLAN_SLUG: Joi.string()
    .pattern(/^[A-Z][A-Z0-9_]{1,31}$/)
    .default('BASIC'),

  // VAT number printed on platform-issued tax invoices (PdfRendererService).
  // Saudi VAT numbers are 15 digits starting with 3 and ending with 03. Tests
  // and dev use 300000000000003; production must register the real number.
  PLATFORM_VAT_NUMBER: Joi.string().pattern(/^3\d{12}03$/).required(),

  // Company names rendered on platform-issued tax invoices. Both locales are
  // required because invoice PDFs are bilingual.
  PLATFORM_COMPANY_NAME_AR: Joi.string().min(1).required(),
  PLATFORM_COMPANY_NAME_EN: Joi.string().min(1).required(),

  // Dedicated OTP-token secret. Falls back to JWT_ACCESS_SECRET in dev with a
  // warning; production REQUIRES a distinct secret so a leaked OTP token
  // cannot forge an access token.
  JWT_OTP_SECRET: Joi.when('NODE_ENV', {
    is: Joi.string().valid('development', 'test'),
    then: Joi.string().min(16).allow('').optional(),
    otherwise: Joi.string().min(16).required(),
  }),

  // Client refresh-token TTL (mobile + website). String like '7d' / '30d'.
  JWT_CLIENT_REFRESH_TTL: Joi.string().default('7d'),

  // Public URLs used in emails/notifications/redirects. Must be HTTPS in prod.
  DASHBOARD_PUBLIC_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri({ scheme: ['https'] }).required(),
    otherwise: Joi.string().uri().allow('').optional(),
  }),
  // Public origin of the backend itself (where third-party webhooks like Zoho
  // will POST to). Distinct from DASHBOARD_PUBLIC_URL: the dashboard and the
  // API typically live on different subdomains (app.deqah.app vs api.deqah.app)
  // and only the API origin is reachable by external services.
  // In production this MUST be HTTPS — Zoho refuses non-TLS webhook URLs.
  API_PUBLIC_URL: process.env.RELAX_PROD_VALIDATION === 'true'
    ? Joi.string().uri().allow('').optional()
    : Joi.when('NODE_ENV', {
        is: 'production',
        then: Joi.string().uri({ scheme: ['https'] }).required(),
        otherwise: Joi.string().uri().allow('').optional(),
      }),
  PUBLIC_WEBSITE_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri({ scheme: ['https'] }).required(),
    otherwise: Joi.string().uri().allow('').optional(),
  }),

  // Super-admin panel (SaaS-05b) — AdminHostGuard accepts only these Host headers.
  // Required in prod so super-admin endpoints aren't reachable from arbitrary hosts.
  ADMIN_HOSTS: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').default('localhost:5104,localhost:5100'),
  }),

  // Authentica platform OTP — REQUIRED in prod since OTP is the primary mobile/website
  // login mechanism. https://portal.authentica.sa/settings/apikeys/
  AUTHENTICA_API_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(8).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  AUTHENTICA_BASE_URL: Joi.string().uri().default('https://api.authentica.sa'),
  AUTHENTICA_DEFAULT_TEMPLATE_ID: Joi.string().default('1'),

  // CAPTCHA (auth bot protection on OTP endpoints).
  // In production, 'noop' is FORBIDDEN — a real provider (hcaptcha | turnstile) is required.
  // Per-account lockout (5 attempts → 15-minute lock) remains in place as a secondary defense.
  CAPTCHA_PROVIDER: Joi.string().valid('noop', 'hcaptcha', 'turnstile').when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('hcaptcha', 'turnstile').required(),
    otherwise: Joi.string().valid('noop', 'hcaptcha', 'turnstile').default('noop'),
  }),
  HCAPTCHA_SECRET: Joi.when('CAPTCHA_PROVIDER', {
    is: 'hcaptcha',
    then: Joi.string().min(8).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  // Cloudflare Turnstile. Required only when CAPTCHA_PROVIDER='turnstile'.
  TURNSTILE_SECRET: Joi.when('CAPTCHA_PROVIDER', {
    is: 'turnstile',
    then: Joi.string().min(8).required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  // Subdomain tenant routing (Task 7)
  // Root domain used to derive tenant slug from the Host header (e.g. sawa.<root> → "sawa").
  // Required in production so the subdomain resolver can strip the apex and extract the slug.
  // Optional in dev — consumer code defaults to "localhost" when unset.
  PLATFORM_ROOT_DOMAIN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  // Optional CSV of additional reserved subdomains merged with the built-in list.
  // Example: "ops,beta" — prevents tenants from registering those slugs.
  RESERVED_SUBDOMAINS: Joi.string().allow('').optional(),

})
  .unknown(true)
  // Production safety net: refuse to boot if any sensitive value is still a
  // dev placeholder. The strings here are the literal dev defaults committed
  // to .env.example. If any of them slip into production, fail fast — a
  // running app with a known JWT secret is far worse than a non-running app.
  .custom((value, helpers) => {
    if (value.NODE_ENV !== 'production') return value;
    const placeholderSubstrings = ['change-me', 'CHANGE_ME', 'REPLACE_ME', 'dev-', 'sk_test_'];
    const sensitiveKeys = [
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'JWT_OTP_SECRET',
      'JWT_CLIENT_ACCESS_SECRET',
      'SMS_PROVIDER_ENCRYPTION_KEY',
      'ZOOM_PROVIDER_ENCRYPTION_KEY',
      'MOYASAR_TENANT_ENCRYPTION_KEY',
      'EMAIL_PROVIDER_ENCRYPTION_KEY',
      'ZOHO_PROVIDER_ENCRYPTION_KEY',
      'ZOHO_OAUTH_CLIENT_SECRET',
      'ZOHO_PLATFORM_REFRESH_TOKEN',
      'ZOHO_PLATFORM_WEBHOOK_SECRET',
      'MOYASAR_PLATFORM_SECRET_KEY',
      'MOYASAR_PLATFORM_WEBHOOK_SECRET',
      'HCAPTCHA_SECRET',
      'AUTHENTICA_API_KEY',
    ];
    for (const key of sensitiveKeys) {
      const v = value[key];
      if (typeof v !== 'string' || v.length === 0) continue;
      if (placeholderSubstrings.some((p) => v.includes(p))) {
        return helpers.error('any.invalid', {
          message: `${key} contains a dev placeholder and must be replaced before running in production`,
        });
      }
    }
    // Reject known bootstrap default for super-admin password
    if (typeof value.SUPER_ADMIN_PASSWORD === 'string') {
      const banned = ['Admin@2026', 'admin', 'password'];
      if (banned.includes(value.SUPER_ADMIN_PASSWORD)) {
        return helpers.error('any.invalid', {
          message: 'SUPER_ADMIN_PASSWORD is set to a known dev default and must be changed before running in production',
        });
      }
    }
    // P0 hardening (2026-05-09 audit): refuse to boot in production with the OWNER role.
    // The runtime MUST use deqah_app (NOBYPASSRLS). Using `:deqah:` in DATABASE_URL means
    // the app would silently bypass every RLS policy — defeating the whole tenant boundary.
    if (typeof value.DATABASE_URL === 'string') {
      // Match `:deqah:` or `://deqah:` but NOT `:deqah_app:` — split on '@' first to inspect creds only
      const creds = value.DATABASE_URL.split('@')[0] ?? '';
      if (/(?:^|\/\/|:)deqah:/.test(creds) && !/deqah_app:/.test(creds)) {
        return helpers.error('any.invalid', {
          message: 'DATABASE_URL uses the OWNER role (deqah). Production runtime MUST use the NOBYPASSRLS role (deqah_app). See docs/operations/p0-rls-cutover.md.',
        });
      }
    }
    // P0 hardening: RLS_GUC_INTERCEPTOR_ENABLED MUST be true in production. The Postgres
    // RLS policies are fail-closed (post 2026-05-09) — leaving the interceptor off either
    // (a) breaks every authenticated query if the role is deqah_app, or (b) silently
    // bypasses RLS if the role is the OWNER. Both are unacceptable.
    if (value.RLS_GUC_INTERCEPTOR_ENABLED !== 'true') {
      return helpers.error('any.invalid', {
        message: 'RLS_GUC_INTERCEPTOR_ENABLED must be "true" in production. Setting it false disables the per-request tenant GUC and leaves the database with no enforced tenant boundary.',
      });
    }
    return value;
  }, 'placeholder rejection in production');
