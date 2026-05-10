# Subdomain-based Tenant Routing — Design Spec

**Date:** 2026-05-10
**Owner:** @tariq
**Branch:** `feature/subdomain-tenant-routing`
**Supersedes (partially):** `docs/superpowers/plans/2026-05-05-tenant-routing-and-custom-domains.md` — that plan chose path-based routing; this spec replaces Phase 1 with subdomain-based routing. Custom-domain phases (2–6) remain valid as a future plan but are out of scope here.

---

## 1. Goal

Every tenant accesses their dashboard at `<slug>.deqah.net`. The dashboard shows the tenant's branding (colors, logo, font) before login, derived from the host. One deployment serves all tenants; the host header determines the tenant.

Custom domains for the per-tenant marketing/booking site (`sawa.com`) are deferred to a later spec — they will be built when `apps/website` per-tenant is built.

## 2. Scope

### In scope
- Backend `SubdomainResolverService` and middleware integration.
- `Organization.slug` validation regex + reserved-words list (DTO + DB CHECK).
- Migration to normalize existing slugs (currently allow `_` and Arabic chars; subdomain rules disallow both).
- Auto-generation of slug in admin tenant-creation wizard (Arabic name → ASCII transliteration → kebab-case → uniqueness suffix if needed). Super-admin can edit the suggested slug before creation.
- Slug edit on existing tenants from admin (with warning + cache invalidation).
- Dashboard reads original Host header via `X-Forwarded-Host` (added in Next.js middleware + Nginx) so `/public/branding` works on `sawa.deqah.net`.
- CORS: switch from static allowlist to function/regex that accepts `*.deqah.net`.
- Tests: unit + e2e for subdomain resolution, slug regex, cross-tenant isolation under different hosts.

### Out of scope (deferred to later specs)
- Custom domain support (`sawa.com` → tenant). To be built when per-tenant website lands.
- Self-signup flow. Slug generation will live in the same service so self-signup can reuse it later.
- Mobile app (single-tenant per build, unaffected).
- Apps/admin tenant routing (admin stays on `admin.deqah.net`; reserved subdomain).
- Marketing site per-tenant routing (`apps/website` not built yet for multi-tenant).
- Subdomain TLS (already handled via Cloudflare wildcard; documented in deployment notes).

## 3. Architecture

### 3.1 Request flow

```
Browser → https://sawa.deqah.net/login
   ↓
Cloudflare (proxied; wildcard TLS *.deqah.net + universal SSL)
   ↓
VPS Nginx
   server_name *.deqah.net;
   proxy_set_header Host $host;
   proxy_set_header X-Forwarded-Host $host;
   ↓
Next.js dashboard (port 5103)
   middleware.ts injects X-Forwarded-Host into proxied requests
   ↓
Backend NestJS (port 5100)
   TenantResolverMiddleware (now async):
     1. JWT claim
     2. super-admin X-Org-Id
     3. public route X-Org-Id (mobile)
     4. Subdomain (NEW)
     5. permissive default
   ↓
SubdomainResolverService
   - extractSubdomain(host, rootDomain) → 'sawa'
   - reservedSubdomains.has('sawa')? → no
   - cache lookup → DB Organization.findUnique({ slug: 'sawa' })
   - returns organizationId or null
   ↓
Branding handler returns tenant colors/logo
```

### 3.2 New files

```
apps/backend/src/common/tenant/
├── subdomain.utils.ts                 # pure helpers (extractSubdomain, isReservedSubdomain, normalizeHost)
├── subdomain.utils.spec.ts            # unit tests for pure helpers
├── subdomain-resolver.service.ts      # injectable, owns the slug→orgId cache
├── subdomain-resolver.service.spec.ts # unit tests with PrismaService mock
```

### 3.3 Modified files

| File | Change |
|---|---|
| `apps/backend/src/common/tenant/tenant-resolver.middleware.ts` | inject `SubdomainResolverService`; convert `use()` to async; insert priority #4 (subdomain) between public X-Org-Id and default |
| `apps/backend/src/common/tenant/tenant-resolver.middleware.spec.ts` | update mock pattern for async middleware; add subdomain priority cases |
| `apps/backend/src/common/tenant/tenant.module.ts` | provide + export `SubdomainResolverService` |
| `apps/backend/src/config/env.validation.ts` | add `PLATFORM_ROOT_DOMAIN` (required in production), `RESERVED_SUBDOMAINS` (optional, has default) |
| `apps/backend/.env.example` | add the two new vars with example values |
| `apps/backend/src/main.ts` | switch CORS `origin` from string array to function that accepts `*.deqah.net` and configured local hosts |
| `apps/backend/src/modules/platform/admin/create-tenant/create-tenant.dto.ts` | add slug regex Zod validation (or class-validator) — pattern `^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$`, length 3–30, reserved-words check |
| `apps/backend/src/modules/platform/tenant-registration/register-tenant.handler.ts` | replace `slugify()` with the shared subdomain-safe slug generator (ASCII-only) |
| `apps/backend/prisma/schema/platform.prisma` | add `@db.VarChar(30)` and document constraint via `///` comment |
| `apps/backend/prisma/migrations/<timestamp>_organization_slug_subdomain_safe/migration.sql` | (a) backfill: convert any existing slug containing `_` or non-ASCII into a subdomain-safe slug (transliterate or strip + suffix); (b) add CHECK constraint `slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$'` |
| `apps/admin/features/organizations/create-tenant/steps/org-step.tsx` | auto-derive slug from `nameAr` via the same generator (debounced); show preview `<slug>.deqah.net`; allow override; live regex/availability check |
| `apps/admin/features/organizations/edit-tenant/...` (or equivalent) | add slug-edit field with confirmation modal warning that old subdomain breaks until cache TTL expires |
| `apps/dashboard/middleware.ts` (new or extend) | forward original Host as `X-Forwarded-Host` on `/api/proxy/*` rewrites so backend sees the real subdomain |
| `apps/dashboard/next.config.mjs` | document the rewrite + middleware contract; no functional change unless rewrites need adjusting |

### 3.4 Slug rules

- **Pattern:** `^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$`
- **Length:** 3–30 characters.
- **Charset:** lowercase letters, digits, hyphen. No leading/trailing hyphen. No double hyphens (enforced in code, not regex).
- **Reserved (case-insensitive):** `www, api, admin, app, auth, dashboard, login, signup, register, billing, settings, public, static, _next, support, help, docs, cdn, mail, smtp, ftp, ns, mx, staging, status, blog, deqah, root, system`. List lives in code (`subdomain.utils.ts`), overridable via `RESERVED_SUBDOMAINS` env (comma-separated, merged with the built-in list).
- **Auto-generation from Arabic name:** transliterate Arabic → Latin (use `transliteration` npm package or a small built-in map), lowercase, replace whitespace with `-`, strip everything outside `[a-z0-9-]`, collapse consecutive hyphens, trim leading/trailing hyphens, truncate to 28 chars (leaves 2 for suffix). On collision, append `-2`, `-3`, …
- **Slug edit on existing org:** allowed but discouraged. UI shows confirmation: "Old subdomain `<old>.deqah.net` will stop working within 5 minutes (cache TTL). Existing bookmarks must be updated." After save, server clears the cache entry for both old and new slug.

### 3.5 Cache strategy

- **In-memory `Map<slug, { id: string; expiresAt: number }>`** in `SubdomainResolverService`.
- **TTL:** 5 minutes per entry.
- **Lazy load:** no pre-warm; first request per slug hits DB.
- **Multi-instance:** each Node instance has its own cache; with 5-min TTL, drift between instances is bounded and acceptable for v1. Redis-backed cache is a future hardening.
- **Negative cache:** unknown subdomains are also cached (`{ id: null }`) for 60 seconds to avoid DB hammering on misconfigured hosts.
- **Manual invalidation:** `SubdomainResolverService.invalidate(slug)` called from the slug-update handler. Invalidates by slug only (handler must invalidate both old and new on rename).

### 3.6 CORS

Replace the current static `origin` array with a function:

```ts
const rootDomain = config.get('PLATFORM_ROOT_DOMAIN'); // e.g. 'deqah.net'
const wildcardRegex = new RegExp(
  `^https?://([a-z0-9-]+\\.)?${rootDomain.replace(/\\./g, '\\\\.')}(:\\\\d+)?$`,
  'i',
);
const allowedFixedOrigins = [...]; // from CORS_ORIGINS env, for non-deqah.net hosts (e.g. localhost)

origin: (requestOrigin, cb) => {
  if (!requestOrigin) return cb(null, true); // server-to-server, curl
  if (wildcardRegex.test(requestOrigin)) return cb(null, true);
  if (allowedFixedOrigins.includes(requestOrigin)) return cb(null, true);
  return cb(new Error(`CORS blocked: ${requestOrigin}`), false);
},
```

### 3.7 Async middleware safety

- `TenantResolverMiddleware.use()` becomes `async use(req, res, next): Promise<void>`.
- NestJS supports async middleware natively.
- All downstream guards/interceptors run after `next()` resolves; the CLS context set by `tenant.set(...)` is established before any guard runs because guards execute after middleware.
- Verified consumers: `JwtGuard`, `CaslGuard`, `TenantGucInterceptor`, `PrismaService` tenant extension all read `tenant.get()` synchronously after the middleware completes — no race.

### 3.8 Host preservation through Next.js proxy

The dashboard proxies `/api/proxy/*` to the backend. By default, Next.js rewrites preserve the inbound Host. To be explicit and future-proof:

- Add `apps/dashboard/middleware.ts` that, on requests matching `/api/proxy/*`, copies the inbound `host` header to `X-Forwarded-Host` before the rewrite. This guarantees the backend sees the original `sawa.deqah.net` even if Next.js or an intermediate proxy rewrites the Host.
- Backend `SubdomainResolverService` reads `X-Forwarded-Host` first, then falls back to `req.hostname`.
- Nginx config already needs `proxy_set_header Host $host;` and `proxy_set_header X-Forwarded-Host $host;` — documented in deployment notes section 6.

## 4. Data model & migration

### 4.1 Schema change

`apps/backend/prisma/schema/platform.prisma`:

```prisma
model Organization {
  // ...
  /// Subdomain-safe slug. Format enforced by DB CHECK "Organization_slug_subdomain_chk":
  /// ^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$ (3–30 chars, lowercase, hyphens allowed mid-string only).
  slug String @unique @db.VarChar(30)
  // ...
}
```

### 4.2 Migration `<ts>_organization_slug_subdomain_safe`

Steps in order:

1. Backfill: for every row whose `slug` violates the new pattern, compute a safe replacement via the same algorithm in §3.4. On collision, append numeric suffix.
2. Add CHECK constraint: `ALTER TABLE "Organization" ADD CONSTRAINT "Organization_slug_subdomain_chk" CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$');`
3. Reserved-words rejection is enforced at the application layer (DTO), not in the DB — keeps the reserved list mutable without requiring migrations.

The backfill must be transactional and idempotent. Document in the migration file's leading comment which orgs (by id) had their slugs changed, so support can notify affected tenants if any.

## 5. Test plan

### 5.1 Unit
- `subdomain.utils.spec.ts`:
  - `extractSubdomain('sawa.deqah.net', 'deqah.net')` → `'sawa'`
  - `extractSubdomain('a.b.deqah.net', 'deqah.net')` → `'a.b'` (multi-label kept; resolver rejects via regex)
  - `extractSubdomain('deqah.net', 'deqah.net')` → `null`
  - `extractSubdomain('localhost', 'deqah.net')` → `null`
  - `extractSubdomain('sawa.localhost:5103', 'localhost')` → `'sawa'`
  - `extractSubdomain('SAWA.DEQAH.NET', 'deqah.net')` → `'sawa'`
  - `extractSubdomain('178.105.84.5', 'deqah.net')` → `null`
  - `extractSubdomain('sawa.deqah.net:443', 'deqah.net')` → `'sawa'` (port stripped)
  - `isReservedSubdomain('www')` → `true`; `isReservedSubdomain('sawa')` → `false`

- `subdomain-resolver.service.spec.ts`:
  - Cache hit/miss
  - Negative cache for unknown slugs (60s)
  - Reserved subdomain returns `null` without DB hit
  - DB lookup called once per TTL window
  - Manual invalidate clears entry

- `tenant-resolver.middleware.spec.ts`:
  - Subdomain priority is between public X-Org-Id and default
  - JWT still wins over subdomain
  - Async middleware works under CLS

### 5.2 E2E
- `apps/backend/test/e2e/security/subdomain-isolation.e2e-spec.ts`:
  - Two orgs A and B; same `/public/branding` endpoint returns A on `a.deqah.net`, B on `b.deqah.net`.
  - Cross-tenant probe: JWT for org A but Host=`b.deqah.net` → JWT wins (returns A's data).
  - Reserved Host (`www.deqah.net`) → no tenant resolved; falls back to default/error per mode.
  - Unknown Host (`unknown.deqah.net`) → 404 or default per mode; never leaks another tenant.

- `apps/dashboard/e2e/smoke/subdomain-branding.spec.ts`:
  - Visiting `a.deqah.net/login` shows tenant A's primary color (CSS custom property).
  - Visiting `b.deqah.net/login` shows tenant B's primary color.

### 5.3 Admin UI
- Existing wizard test: slug auto-fills from `nameAr`, preview shows `<slug>.deqah.net`, regex error on invalid edit, reserved-word error on `admin`.

## 6. Deployment notes

- DNS: wildcard `*.deqah.net` already configured at Cloudflare (proxied).
- TLS: Cloudflare Universal SSL covers `deqah.net` and `*.deqah.net` (single level).
- Nginx (`docker/nginx.conf` or equivalent):
  - `server_name *.deqah.net;`
  - `proxy_set_header Host $host;`
  - `proxy_set_header X-Forwarded-Host $host;`
  - `proxy_set_header X-Forwarded-Proto $scheme;`
  - `proxy_set_header X-Real-IP $remote_addr;`
- Env vars to set in production:
  - `PLATFORM_ROOT_DOMAIN=deqah.net`
  - `RESERVED_SUBDOMAINS=` (optional, merges with built-in list)
  - `CORS_ORIGINS=` (no longer the only allowlist; the regex covers `*.deqah.net` automatically)

## 7. Rollout

1. PR — backend resolver + middleware + tests + slug DTO validation. Behind no flag; behavior is additive (existing JWT/header paths unchanged).
2. PR — migration for slug normalization + DB CHECK constraint. Run on staging first; verify no orgs break.
3. PR — admin wizard slug UX (auto-derive, preview, edit-with-warning).
4. PR — dashboard middleware (X-Forwarded-Host) + Nginx config update + CORS regex.
5. Manual QA on staging: provision two test tenants with different slugs, verify branded login on each.
6. Production rollout: env vars set, Nginx reloaded, monitor logs for `TenantResolutionError` and CORS rejections for 24h.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Existing slug contains `_` or Arabic chars and the migration backfill produces a collision | Migration uses uniqueness suffix loop; logs every changed slug for audit |
| Async middleware regresses request latency | Cache absorbs all but the first hit per slug per 5 minutes; DB query is a single indexed `findUnique` (~1 ms) |
| Cache drift across multiple Node instances | Bounded by 5-min TTL; manual invalidation triggers on slug rename in same instance only — the others self-correct in ≤5 min |
| Misconfigured Host header breaks resolution silently | Negative-cache logging + structured `TenantResolutionError` with the host included; alert on rate spike |
| CORS regex misconfigured and blocks a legitimate origin | Function logs blocked origins (sampled); allow override via `CORS_ORIGINS` for emergency |
| Reserved subdomain like `admin` collides with existing tenant slug `admin` | Migration scans for collisions before adding the constraint; rejects deployment with a clear error so operator can rename the offending org first |
| Slug rename breaks bookmarks | UI warning + 5-min TTL communicated; `OrganizationSlugAlias` (from the prior plan §4.3) is deferred but the door is left open by isolating slug → orgId resolution in the service |

## 9. Open decisions (resolved)

- **Mobile:** unaffected. Stays single-tenant per build with `X-Org-Id` header.
- **Marketing site:** out of scope; per-tenant marketing/booking site is a future spec when `apps/website` evolves.
- **Slug edit:** allowed by super-admin only, with confirmation. Self-service rename is out of scope.
- **Self-signup:** out of scope; slug generator is exposed as a shared utility so self-signup can reuse it later.

## 10. Definition of Done

- `<existing-slug>.deqah.net/login` shows the tenant's branding (colors + logo) without authentication.
- Two tenants on different subdomains see only their own data after login.
- Slug regex enforced in both DTO and DB; existing slugs migrated without data loss.
- Admin wizard auto-fills slug from name with live preview and reserved-word check.
- All new unit + e2e tests pass; existing tenant-isolation suite still green.
- Production env documented; Nginx config updated; CORS allows `*.deqah.net`.
