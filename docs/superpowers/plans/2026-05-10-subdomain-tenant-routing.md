# Subdomain-based Tenant Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve every Deqah tenant from `<slug>.deqah.net`, so the dashboard renders the tenant's branding (colors, logo, font) before login and serves data isolation by host.

**Architecture:** A new `SubdomainResolverService` (in-memory cached) maps host → `organizationId` and is wired as priority #4 in `TenantResolverMiddleware` (after JWT, super-admin header, and public X-Org-Id). The middleware becomes async. The dashboard preserves the original Host as `X-Forwarded-Host` so backend `/public/*` routes resolve the tenant before any JWT exists. Slug is constrained to a DNS-safe regex via DTO + DB CHECK; existing slugs are normalized by a one-shot migration. CORS switches from a static allowlist to a wildcard regex covering `*.deqah.net`.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Next.js 15 (App Router), TanStack Query, Cloudflare (wildcard DNS + TLS), Nginx.

**Spec:** `docs/superpowers/specs/2026-05-10-subdomain-tenant-routing-design.md`

**Branch:** `feature/subdomain-tenant-routing` (already created, push tracked).

**PR plan:**
1. **PR-1** — backend resolver + middleware + slug DTO validation + tests (Tasks 1–7).
2. **PR-2** — Prisma schema constraint + slug-normalization migration (Tasks 8–9).
3. **PR-3** — admin wizard slug UX (auto-derive, preview, regex feedback, edit-on-existing) (Tasks 10–12).
4. **PR-4** — dashboard host preservation + CORS regex + Nginx + e2e (Tasks 13–16).

Each PR is independently mergeable behind no flag — behavior is additive (existing JWT/header paths unchanged).

---

## File Structure

### New files (created by this plan)

```
apps/backend/src/common/tenant/
├── subdomain.utils.ts                  # pure helpers (extractSubdomain, isReservedSubdomain, normalizeHost)
├── subdomain.utils.spec.ts             # unit tests
├── subdomain-resolver.service.ts       # injectable; owns slug→orgId in-memory cache
├── subdomain-resolver.service.spec.ts  # unit tests
└── subdomain-tenant-isolation.e2e-spec.ts  # cross-tenant probe via Host header

apps/backend/src/common/tenant/slug-generator.util.ts        # shared subdomain-safe slugifier
apps/backend/src/common/tenant/slug-generator.util.spec.ts   # unit tests

apps/backend/prisma/migrations/<ts>_organization_slug_subdomain_safe/migration.sql

apps/dashboard/middleware.ts            # forwards original Host as X-Forwarded-Host on /api/proxy/*

apps/dashboard/e2e/smoke/subdomain-branding.spec.ts          # Playwright smoke: branded login per host
```

### Modified files

| File | What changes |
|---|---|
| `apps/backend/src/common/tenant/tenant-resolver.middleware.ts` | inject `SubdomainResolverService`; convert `use()` to async; insert priority #4 (subdomain) between public X-Org-Id and default |
| `apps/backend/src/common/tenant/tenant-resolver.middleware.spec.ts` | update mock pattern for async middleware; add subdomain priority cases |
| `apps/backend/src/common/tenant/tenant.module.ts` | provide + export `SubdomainResolverService`; ensure `PrismaService` available |
| `apps/backend/src/config/env.validation.ts` | add `PLATFORM_ROOT_DOMAIN` (required in production) and `RESERVED_SUBDOMAINS` (optional CSV) |
| `apps/backend/.env.example` | document the two new vars |
| `apps/backend/src/main.ts` | swap CORS `origin` from string array to function (wildcard regex + fixed allowlist) |
| `apps/backend/src/modules/platform/admin/create-tenant/create-tenant.dto.ts` | add slug regex + length validation; reject reserved words |
| `apps/backend/src/modules/platform/tenant-registration/register-tenant.handler.ts` | replace inline `slugify()` with shared `generateSubdomainSafeSlug()`; collision-loop with suffix |
| `apps/backend/prisma/schema/platform.prisma` | annotate `slug` with `@db.VarChar(30)` and triple-slash docstring |
| `apps/admin/features/organizations/create-tenant/steps/org-step.tsx` | derive slug from `nameAr` via the same generator (debounced); show preview `<slug>.deqah.net`; show regex/availability errors |
| `apps/admin/features/organizations/edit-tenant/...` | add slug-edit field with confirmation modal explaining cache TTL |

### Out-of-scope files (explicit no-touch)

- `apps/mobile/**` — single-tenant per build, unaffected.
- `apps/admin` shell layout (admin stays on `admin.deqah.net`, reserved subdomain).
- `apps/website/**` and `apps/marketing/**` — separate plan when per-tenant marketing site lands.

---

## Conventions used in every task

- **TDD always:** failing test first, run it, implement, run again, commit.
- **Commit policy:** docs paths require `git add -f` because `docs/*` is gitignored. Code paths use plain `git add <file>`.
- **No `any` in TS.** Strict mode is on across the repo.
- **Single PR per phase.** Push after each task; open PR once a phase's tasks are all green and reviewed locally.
- **Branch:** every task is committed on `feature/subdomain-tenant-routing`.
- **Run tests via:** `cd apps/backend && npx jest <path>` for unit; `cd apps/backend && npm run test:e2e -- <path>` for e2e.

---

# PR-1 — Backend resolver + middleware + slug validation

### Task 1: Pure subdomain utilities (TDD)

**Files:**
- Create: `apps/backend/src/common/tenant/subdomain.utils.ts`
- Test: `apps/backend/src/common/tenant/subdomain.utils.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/tenant/subdomain.utils.spec.ts`:

```ts
import {
  extractSubdomain,
  isReservedSubdomain,
  normalizeHost,
  DEFAULT_RESERVED_SUBDOMAINS,
} from './subdomain.utils';

describe('subdomain.utils', () => {
  describe('normalizeHost', () => {
    it('strips port and lowercases', () => {
      expect(normalizeHost('SAWA.Deqah.NET:443')).toBe('sawa.deqah.net');
    });
    it('returns null for IPv4', () => {
      expect(normalizeHost('178.105.84.5')).toBeNull();
    });
    it('returns null for empty', () => {
      expect(normalizeHost('')).toBeNull();
      expect(normalizeHost(undefined)).toBeNull();
    });
  });

  describe('extractSubdomain', () => {
    it('returns subdomain when host ends with rootDomain', () => {
      expect(extractSubdomain('sawa.deqah.net', 'deqah.net')).toBe('sawa');
    });
    it('returns null when host equals rootDomain', () => {
      expect(extractSubdomain('deqah.net', 'deqah.net')).toBeNull();
    });
    it('returns null when host does not end with rootDomain', () => {
      expect(extractSubdomain('sawa.example.com', 'deqah.net')).toBeNull();
    });
    it('handles multi-label subdomain (returns full prefix; caller filters)', () => {
      expect(extractSubdomain('a.b.deqah.net', 'deqah.net')).toBe('a.b');
    });
    it('lowercases input', () => {
      expect(extractSubdomain('SAWA.DEQAH.NET', 'deqah.net')).toBe('sawa');
    });
    it('strips port', () => {
      expect(extractSubdomain('sawa.deqah.net:443', 'deqah.net')).toBe('sawa');
    });
    it('works for localhost root', () => {
      expect(extractSubdomain('sawa.localhost:5103', 'localhost')).toBe('sawa');
    });
    it('returns null for plain localhost', () => {
      expect(extractSubdomain('localhost', 'localhost')).toBeNull();
    });
    it('returns null for IP', () => {
      expect(extractSubdomain('178.105.84.5', 'deqah.net')).toBeNull();
    });
  });

  describe('isReservedSubdomain', () => {
    it('flags built-in reserved names', () => {
      for (const r of ['www', 'api', 'admin', 'app', 'auth', 'staging']) {
        expect(isReservedSubdomain(r, DEFAULT_RESERVED_SUBDOMAINS)).toBe(true);
      }
    });
    it('case-insensitive', () => {
      expect(isReservedSubdomain('WWW', DEFAULT_RESERVED_SUBDOMAINS)).toBe(true);
    });
    it('non-reserved returns false', () => {
      expect(isReservedSubdomain('sawa', DEFAULT_RESERVED_SUBDOMAINS)).toBe(false);
    });
    it('multi-label flagged via dot', () => {
      // multi-label like "a.b" is not a single subdomain label; treat as reserved/invalid
      expect(isReservedSubdomain('a.b', DEFAULT_RESERVED_SUBDOMAINS)).toBe(true);
    });
    it('honors extra reserved set', () => {
      expect(isReservedSubdomain('myextra', new Set(['myextra']))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/backend && npx jest src/common/tenant/subdomain.utils.spec.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal utilities**

Create `apps/backend/src/common/tenant/subdomain.utils.ts`:

```ts
/**
 * Built-in reserved subdomains. Merged with optional env-supplied list
 * (RESERVED_SUBDOMAINS, comma-separated) at module bootstrap.
 */
export const DEFAULT_RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'admin',
  'app',
  'auth',
  'dashboard',
  'login',
  'signup',
  'register',
  'billing',
  'settings',
  'public',
  'static',
  '_next',
  'support',
  'help',
  'docs',
  'cdn',
  'mail',
  'smtp',
  'ftp',
  'ns',
  'mx',
  'staging',
  'status',
  'blog',
  'deqah',
  'root',
  'system',
]);

const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Normalize an inbound Host header: lowercase, strip port. Returns null when the
 * value is empty, undefined, or an IPv4 literal (which can never be a subdomain).
 */
export function normalizeHost(host: string | undefined | null): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  const noPort = trimmed.replace(/:\d+$/, '');
  if (IPV4_REGEX.test(noPort)) return null;
  return noPort;
}

/**
 * Extract the subdomain prefix when host ends with the configured root domain.
 * Returns null when the host equals the root, when it does not match, or when
 * the host is not a usable name (IP, empty).
 */
export function extractSubdomain(
  host: string | undefined | null,
  rootDomain: string,
): string | null {
  const h = normalizeHost(host);
  if (!h) return null;
  const root = rootDomain.toLowerCase();
  if (h === root) return null;
  const suffix = `.${root}`;
  if (!h.endsWith(suffix)) return null;
  const sub = h.slice(0, -suffix.length);
  return sub.length === 0 ? null : sub;
}

/**
 * Reserved if the candidate appears in the built-in/extra set, OR if it
 * contains a dot (multi-label like `a.b` cannot map to a single org slug).
 */
export function isReservedSubdomain(
  subdomain: string,
  reserved: ReadonlySet<string>,
): boolean {
  const lower = subdomain.toLowerCase();
  if (lower.includes('.')) return true;
  return reserved.has(lower);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/backend && npx jest src/common/tenant/subdomain.utils.spec.ts
```
Expected: PASS — all describe/it green.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/common/tenant/subdomain.utils.ts \
        apps/backend/src/common/tenant/subdomain.utils.spec.ts
git commit -m "feat(tenant): add pure subdomain utilities"
```

---

### Task 2: Shared subdomain-safe slug generator (TDD)

**Files:**
- Create: `apps/backend/src/common/tenant/slug-generator.util.ts`
- Test: `apps/backend/src/common/tenant/slug-generator.util.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/backend/src/common/tenant/slug-generator.util.spec.ts
import {
  generateSubdomainSafeSlug,
  SLUG_REGEX,
  SLUG_MIN_LEN,
  SLUG_MAX_LEN,
} from './slug-generator.util';

describe('generateSubdomainSafeSlug', () => {
  it('exposes the canonical regex', () => {
    expect(SLUG_REGEX.source).toBe('^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$');
    expect(SLUG_MIN_LEN).toBe(3);
    expect(SLUG_MAX_LEN).toBe(30);
  });

  it('lowercases ASCII names', () => {
    expect(generateSubdomainSafeSlug('Sawa Clinic')).toBe('sawa-clinic');
  });

  it('replaces spaces with single hyphens and collapses repeats', () => {
    expect(generateSubdomainSafeSlug('  Sawa   Clinic  ')).toBe('sawa-clinic');
  });

  it('strips characters outside [a-z0-9-]', () => {
    expect(generateSubdomainSafeSlug('Sawa! Clinic@2025')).toBe('sawa-clinic2025');
  });

  it('transliterates basic Arabic letters to ASCII', () => {
    // عيادة سواء  → ayadt-swa (deterministic mapping; we don't promise linguistic perfection)
    expect(generateSubdomainSafeSlug('عيادة سواء')).toMatch(SLUG_REGEX);
  });

  it('truncates to SLUG_MAX_LEN', () => {
    const long = 'a'.repeat(60);
    const out = generateSubdomainSafeSlug(long);
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX_LEN);
    expect(out).toMatch(SLUG_REGEX);
  });

  it('strips leading/trailing hyphens', () => {
    expect(generateSubdomainSafeSlug('---hello---')).toBe('hello');
  });

  it('falls back to "org" when input yields nothing', () => {
    expect(generateSubdomainSafeSlug('!!!')).toBe('org');
    expect(generateSubdomainSafeSlug('')).toBe('org');
  });

  it('always satisfies SLUG_REGEX', () => {
    for (const s of ['ab', 'a', 'a-', '-a', 'A B', '1', '##', 'مرحبا']) {
      expect(generateSubdomainSafeSlug(s)).toMatch(SLUG_REGEX);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd apps/backend && npx jest src/common/tenant/slug-generator.util.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/common/tenant/slug-generator.util.ts

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
export const SLUG_MIN_LEN = 3;
export const SLUG_MAX_LEN = 30;

/**
 * Map of common Arabic letters to a Latin approximation. Not a linguistic
 * transliteration scheme — its only goal is to produce something a human can
 * recognize for a generated default slug. Operators always have the option to
 * override the auto-generated value in the wizard.
 */
const AR_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ى': 'a',
  'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh',
  'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd',
  'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l',
  'م': 'm', 'ن': 'n',
  'ه': 'h', 'ة': 'h',
  'و': 'w', 'ؤ': 'w',
  'ي': 'y', 'ئ': 'y',
  'ء': '',
};

function transliterateArabic(input: string): string {
  let out = '';
  for (const ch of input) {
    out += AR_TO_LATIN[ch] ?? ch;
  }
  return out;
}

/**
 * Produce a subdomain-safe slug from any human-supplied name. Always returns a
 * value that matches SLUG_REGEX; collision handling is the caller's job.
 */
export function generateSubdomainSafeSlug(input: string): string {
  const transliterated = transliterateArabic(input ?? '');
  let slug = transliterated
    .toLowerCase()
    .replace(/[\s_]+/g, '-')        // whitespace + underscores → hyphen
    .replace(/[^a-z0-9-]/g, '')     // strip everything outside [a-z0-9-]
    .replace(/-{2,}/g, '-')         // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens

  if (slug.length === 0) slug = 'org';

  if (slug.length > SLUG_MAX_LEN) {
    slug = slug.slice(0, SLUG_MAX_LEN).replace(/-+$/g, '');
  }

  if (slug.length < SLUG_MIN_LEN) {
    slug = (slug + 'org').slice(0, SLUG_MIN_LEN);
  }

  // Final regex guarantee — if anything slipped through, fall back.
  return SLUG_REGEX.test(slug) ? slug : 'org';
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd apps/backend && npx jest src/common/tenant/slug-generator.util.spec.ts
```

- [ ] **Step 5: Commit**

```
git add apps/backend/src/common/tenant/slug-generator.util.ts \
        apps/backend/src/common/tenant/slug-generator.util.spec.ts
git commit -m "feat(tenant): add shared subdomain-safe slug generator"
```

---

### Task 3: Replace existing `slugify()` in tenant registration (TDD)

**Files:**
- Modify: `apps/backend/src/modules/platform/tenant-registration/register-tenant.handler.ts`
- Test: same handler's existing `*.spec.ts` (extend); if none, create one for the slug behavior.

- [ ] **Step 1: Find the existing handler & its spec**

```
ls apps/backend/src/modules/platform/tenant-registration/
```
Identify `register-tenant.handler.ts` and its `.spec.ts` (or note that no spec exists — then create `register-tenant.handler.slug.spec.ts` minimal harness).

- [ ] **Step 2: Add a failing test that asserts the new generator is used**

If a spec exists, append:

```ts
// register-tenant.handler.spec.ts (additions)
import { generateSubdomainSafeSlug } from '../../../common/tenant/slug-generator.util';

describe('RegisterTenantHandler — slug', () => {
  it('produces a slug that matches the subdomain regex', async () => {
    const dto = { businessNameAr: 'عيادة سواء', /* …other required fields per existing DTO… */ } as any;
    const out = await handler.execute(dto); // adapt to actual signature
    expect(out.organization.slug).toMatch(/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/);
    expect(out.organization.slug.startsWith(generateSubdomainSafeSlug('عيادة سواء').slice(0, 3))).toBe(true);
  });

  it('appends a numeric suffix on slug collision', async () => {
    // Arrange existing org with slug "sawa", then call execute with name that yields "sawa".
    // Assert returned slug is "sawa-2".
    // (Use whatever Prisma mock or in-memory pattern this spec already uses.)
  });
});
```

If no spec exists, create one with these two cases plus the minimum scaffolding to instantiate the handler against a Prisma mock / test module already used elsewhere in `platform/`.

- [ ] **Step 3: Run — expect FAIL**

```
cd apps/backend && npx jest src/modules/platform/tenant-registration
```

- [ ] **Step 4: Replace slug logic in handler**

In `register-tenant.handler.ts`:

1. Remove the inline `slugify()` function.
2. Import the shared generator:

```ts
import { generateSubdomainSafeSlug } from '../../../common/tenant/slug-generator.util';
```

3. Replace the slug computation. The original was:

```ts
const baseSlug = slugify(dto.businessNameAr) || 'org';
const slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;
```

Replace with collision-safe loop:

```ts
const baseSlug = generateSubdomainSafeSlug(dto.businessNameAr);
let slug = baseSlug;
for (let i = 2; ; i++) {
  const exists = await this.prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!exists) break;
  const suffix = `-${i}`;
  const head = baseSlug.slice(0, Math.max(1, 30 - suffix.length));
  slug = `${head}${suffix}`;
  if (i > 50) {
    throw new Error(`Could not allocate a unique slug after 50 attempts (base="${baseSlug}")`);
  }
}
```

4. Drop `randomBytes` import if no longer used.

- [ ] **Step 5: Run tests — expect PASS**

```
cd apps/backend && npx jest src/modules/platform/tenant-registration
```

- [ ] **Step 6: Commit**

```
git add apps/backend/src/modules/platform/tenant-registration/register-tenant.handler.ts \
        apps/backend/src/modules/platform/tenant-registration/*.spec.ts
git commit -m "refactor(tenant-registration): use shared subdomain-safe slug generator with collision suffix"
```

---

### Task 4: Add slug DTO validation in admin create-tenant (TDD)

**Files:**
- Modify: `apps/backend/src/modules/platform/admin/create-tenant/create-tenant.dto.ts`
- Test: `apps/backend/src/modules/platform/admin/create-tenant/create-tenant.dto.spec.ts` (create if missing)

- [ ] **Step 1: Failing test**

```ts
// create-tenant.dto.spec.ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTenantDto } from './create-tenant.dto';

async function violations(input: Partial<CreateTenantDto>) {
  const errs = await validate(plainToInstance(CreateTenantDto, input as object));
  return errs.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateTenantDto.slug', () => {
  const base: Partial<CreateTenantDto> = {
    // Fill with whatever non-slug fields the existing DTO requires.
    // Assume nameAr/nameEn/etc are required; use realistic test values here.
  };

  it('rejects uppercase', async () => {
    const out = await violations({ ...base, slug: 'SAWA' });
    expect(out.join(' ')).toMatch(/slug/i);
  });
  it('rejects underscore', async () => {
    const out = await violations({ ...base, slug: 'sa_wa' });
    expect(out.join(' ')).toMatch(/slug/i);
  });
  it('rejects leading hyphen', async () => {
    const out = await violations({ ...base, slug: '-sawa' });
    expect(out.join(' ')).toMatch(/slug/i);
  });
  it('rejects trailing hyphen', async () => {
    const out = await violations({ ...base, slug: 'sawa-' });
    expect(out.join(' ')).toMatch(/slug/i);
  });
  it('rejects too short', async () => {
    const out = await violations({ ...base, slug: 'ab' });
    expect(out.join(' ')).toMatch(/slug/i);
  });
  it('rejects too long', async () => {
    const out = await violations({ ...base, slug: 'a'.repeat(31) });
    expect(out.join(' ')).toMatch(/slug/i);
  });
  it('rejects reserved word "admin"', async () => {
    const out = await violations({ ...base, slug: 'admin' });
    expect(out.join(' ')).toMatch(/reserved/i);
  });
  it('accepts a valid slug', async () => {
    const out = await violations({ ...base, slug: 'sawa-clinic' });
    expect(out.join(' ')).not.toMatch(/slug/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd apps/backend && npx jest src/modules/platform/admin/create-tenant/create-tenant.dto.spec.ts
```

- [ ] **Step 3: Add validation to the DTO**

Open `create-tenant.dto.ts`. Add to the existing class:

```ts
import { Matches, Length, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DEFAULT_RESERVED_SUBDOMAINS } from '../../../common/tenant/subdomain.utils';
import { SLUG_REGEX, SLUG_MIN_LEN, SLUG_MAX_LEN } from '../../../common/tenant/slug-generator.util';

@ValidatorConstraint({ name: 'NotReservedSubdomain', async: false })
class NotReservedSubdomainConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return !DEFAULT_RESERVED_SUBDOMAINS.has(value.toLowerCase());
  }
  defaultMessage(): string {
    return 'slug is reserved';
  }
}

// Inside CreateTenantDto:
@ApiProperty({ example: 'sawa-clinic', description: 'Subdomain slug; 3–30 chars, lowercase, [a-z0-9-], no leading/trailing hyphen, not reserved' })
@Length(SLUG_MIN_LEN, SLUG_MAX_LEN, { message: `slug must be ${SLUG_MIN_LEN}–${SLUG_MAX_LEN} chars` })
@Matches(SLUG_REGEX, { message: 'slug must match subdomain regex' })
@Validate(NotReservedSubdomainConstraint)
slug!: string;
```

(If `slug` already exists on the DTO, replace its decorators; do not duplicate the property.)

- [ ] **Step 4: Run — expect PASS**

```
cd apps/backend && npx jest src/modules/platform/admin/create-tenant/create-tenant.dto.spec.ts
```

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/platform/admin/create-tenant/create-tenant.dto.ts \
        apps/backend/src/modules/platform/admin/create-tenant/create-tenant.dto.spec.ts
git commit -m "feat(admin): validate slug as subdomain-safe + reject reserved"
```

---

### Task 5: `SubdomainResolverService` (TDD)

**Files:**
- Create: `apps/backend/src/common/tenant/subdomain-resolver.service.ts`
- Test: `apps/backend/src/common/tenant/subdomain-resolver.service.spec.ts`

- [ ] **Step 1: Failing test**

```ts
// subdomain-resolver.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SubdomainResolverService } from './subdomain-resolver.service';

describe('SubdomainResolverService', () => {
  let svc: SubdomainResolverService;
  let prisma: { organization: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    const config = { get: (k: string, d?: string) => (k === 'PLATFORM_ROOT_DOMAIN' ? 'deqah.net' : d) };
    const mod = await Test.createTestingModule({
      providers: [
        SubdomainResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    svc = mod.get(SubdomainResolverService);
  });

  it('returns null for plain root host', async () => {
    expect(await svc.resolve('deqah.net')).toBeNull();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns null for IPs', async () => {
    expect(await svc.resolve('178.105.84.5')).toBeNull();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns null for reserved subdomain (no DB hit)', async () => {
    expect(await svc.resolve('admin.deqah.net')).toBeNull();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('looks up DB for valid subdomain and caches the result', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    const a = await svc.resolve('sawa.deqah.net');
    const b = await svc.resolve('sawa.deqah.net');
    expect(a).toBe('org-1');
    expect(b).toBe('org-1');
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it('caches negative lookups for unknown subdomains', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce(null);
    expect(await svc.resolve('ghost.deqah.net')).toBeNull();
    expect(await svc.resolve('ghost.deqah.net')).toBeNull();
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it('invalidate clears a slug entry', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    await svc.resolve('sawa.deqah.net');
    svc.invalidate('sawa');
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    await svc.resolve('sawa.deqah.net');
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd apps/backend && npx jest src/common/tenant/subdomain-resolver.service.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/common/tenant/subdomain-resolver.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { extractSubdomain, isReservedSubdomain, DEFAULT_RESERVED_SUBDOMAINS } from './subdomain.utils';
import { SLUG_REGEX } from './slug-generator.util';

interface CacheEntry {
  id: string | null;
  expiresAt: number;
}

const POSITIVE_TTL_MS = 5 * 60_000;
const NEGATIVE_TTL_MS = 60_000;

@Injectable()
export class SubdomainResolverService {
  private readonly logger = new Logger(SubdomainResolverService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly reserved: ReadonlySet<string>;
  private readonly rootDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.rootDomain = config.get<string>('PLATFORM_ROOT_DOMAIN', 'deqah.net');
    const extra = (config.get<string>('RESERVED_SUBDOMAINS', '') || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    this.reserved = new Set([...DEFAULT_RESERVED_SUBDOMAINS, ...extra]);
  }

  /** Returns the organizationId for the given host, or null when unresolved. */
  async resolve(host: string | undefined | null): Promise<string | null> {
    const subdomain = extractSubdomain(host, this.rootDomain);
    if (!subdomain) return null;
    if (isReservedSubdomain(subdomain, this.reserved)) return null;
    if (!SLUG_REGEX.test(subdomain)) return null;

    const cached = this.cache.get(subdomain);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.id;

    const row = await this.prisma.organization.findUnique({
      where: { slug: subdomain },
      select: { id: true },
    });
    const id = row?.id ?? null;
    this.cache.set(subdomain, {
      id,
      expiresAt: now + (id ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
    });
    if (!id) this.logger.debug(`Negative cache: subdomain ${subdomain}`);
    return id;
  }

  /** Drop a single slug from the cache. Call from update-slug handlers. */
  invalidate(slug: string): void {
    this.cache.delete(slug.toLowerCase());
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd apps/backend && npx jest src/common/tenant/subdomain-resolver.service.spec.ts
```

- [ ] **Step 5: Register in `tenant.module.ts`**

Edit `apps/backend/src/common/tenant/tenant.module.ts` and add `SubdomainResolverService` to both `providers` and `exports` arrays.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/common/tenant/subdomain-resolver.service.ts \
        apps/backend/src/common/tenant/subdomain-resolver.service.spec.ts \
        apps/backend/src/common/tenant/tenant.module.ts
git commit -m "feat(tenant): add SubdomainResolverService with in-memory cache"
```

---

### Task 6: Wire resolver into `TenantResolverMiddleware` (async, TDD)

**Files:**
- Modify: `apps/backend/src/common/tenant/tenant-resolver.middleware.ts`
- Modify: `apps/backend/src/common/tenant/tenant-resolver.middleware.spec.ts`

- [ ] **Step 1: Add failing tests for subdomain priority**

Append to `tenant-resolver.middleware.spec.ts`:

```ts
describe('TenantResolverMiddleware — subdomain priority', () => {
  // Helpers below assume the existing test harness pattern in this file. Adapt
  // names if the existing harness uses different builders.

  it('uses subdomain when no JWT and no header', async () => {
    const subdomain = jest.fn().mockResolvedValue('org-from-subdomain');
    const mw = makeMiddleware({ subdomainResolver: { resolve: subdomain, invalidate: jest.fn() } });
    const req = makeReq({ host: 'sawa.deqah.net', path: '/api/v1/public/branding' });
    const next = jest.fn();
    await mw.use(req, makeRes(), next);
    expect(subdomain).toHaveBeenCalledWith('sawa.deqah.net');
    expect(getCtx().organizationId).toBe('org-from-subdomain');
    expect(next).toHaveBeenCalled();
  });

  it('JWT still wins over subdomain', async () => {
    const subdomain = jest.fn().mockResolvedValue('org-from-subdomain');
    const mw = makeMiddleware({ subdomainResolver: { resolve: subdomain, invalidate: jest.fn() } });
    const req = makeReq({
      host: 'sawa.deqah.net',
      path: '/api/v1/dashboard/users',
      user: { id: 'u1', organizationId: 'org-from-jwt' },
    });
    const next = jest.fn();
    await mw.use(req, makeRes(), next);
    expect(getCtx().organizationId).toBe('org-from-jwt');
  });

  it('public route X-Org-Id wins over subdomain', async () => {
    const subdomain = jest.fn().mockResolvedValue('org-from-subdomain');
    const mw = makeMiddleware({ subdomainResolver: { resolve: subdomain, invalidate: jest.fn() } });
    const req = makeReq({
      host: 'sawa.deqah.net',
      path: '/api/v1/public/branding',
      headers: { 'x-org-id': '00000000-0000-0000-0000-000000000001' },
    });
    const next = jest.fn();
    await mw.use(req, makeRes(), next);
    expect(getCtx().organizationId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('falls through to default when subdomain returns null', async () => {
    const subdomain = jest.fn().mockResolvedValue(null);
    const mw = makeMiddleware({
      mode: 'permissive',
      subdomainResolver: { resolve: subdomain, invalidate: jest.fn() },
    });
    const req = makeReq({ host: 'unknown.deqah.net', path: '/api/v1/public/branding' });
    await mw.use(req, makeRes(), jest.fn());
    expect(getCtx().organizationId).toBeDefined(); // default org id
  });
});
```

(If `makeMiddleware`/`makeReq`/`getCtx` helpers don't exist verbatim, mirror the patterns already used in this spec — copy the existing setup blocks.)

- [ ] **Step 2: Run — expect FAIL**

```
cd apps/backend && npx jest src/common/tenant/tenant-resolver.middleware.spec.ts
```

- [ ] **Step 3: Convert middleware to async + insert subdomain priority**

In `tenant-resolver.middleware.ts`:

1. Inject the resolver:

```ts
constructor(
  private readonly ctx: TenantContextService,
  private readonly config: ConfigService,
  private readonly subdomainResolver: SubdomainResolverService,
) {}
```

2. Change `use` signature to `async`:

```ts
async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
```

3. After computing `fromPublicHeader`, add:

```ts
const hostHeader =
  (req.headers['x-forwarded-host'] as string | undefined) ??
  req.hostname ??
  (req.headers.host as string | undefined);

const fromSubdomain = !req.user
  ? await this.subdomainResolver.resolve(hostHeader)
  : null;
```

4. Update the priority chain:

```ts
const organizationId =
  fromSuperAdminHeader ??
  fromJwt ??
  fromPublicHeader ??
  fromSubdomain ??       // ← NEW
  fromDefault;
```

5. Update existing test mocks if any test currently expects sync behavior (look for `mw.use(...)` calls without `await` and add `await`).

- [ ] **Step 4: Run all tenant-resolver tests — expect PASS**

```
cd apps/backend && npx jest src/common/tenant
```

- [ ] **Step 5: Commit**

```
git add apps/backend/src/common/tenant/tenant-resolver.middleware.ts \
        apps/backend/src/common/tenant/tenant-resolver.middleware.spec.ts
git commit -m "feat(tenant): resolve tenant from subdomain (priority #4) — async middleware"
```

---

### Task 7: Env vars + .env.example

**Files:**
- Modify: `apps/backend/src/config/env.validation.ts`
- Modify: `apps/backend/.env.example`

- [ ] **Step 1: Add env vars**

In `env.validation.ts` add (preserving the existing schema style — class-validator or zod, whichever the file uses):

```ts
@IsOptional()  // optional in dev; required in production via cross-field check below if pattern exists
@IsString()
PLATFORM_ROOT_DOMAIN?: string;

@IsOptional()
@IsString()
RESERVED_SUBDOMAINS?: string;
```

If the file already enforces `NODE_ENV === 'production'` constraints, mirror the existing pattern to require `PLATFORM_ROOT_DOMAIN` in production.

- [ ] **Step 2: Update `.env.example`**

Add these lines (group them with other tenant/host vars):

```
# Subdomain tenant routing
# Root domain used to derive tenant from Host header (e.g. sawa.<root> → tenant "sawa").
# Required in production. In dev defaults to "localhost" if unset.
PLATFORM_ROOT_DOMAIN=deqah.net

# Optional CSV merged with the built-in reserved-subdomains list. Example:
# RESERVED_SUBDOMAINS=ops,beta
RESERVED_SUBDOMAINS=
```

- [ ] **Step 3: Verify boot still works locally**

```
cd apps/backend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/config/env.validation.ts apps/backend/.env.example
git commit -m "feat(config): add PLATFORM_ROOT_DOMAIN + RESERVED_SUBDOMAINS env"
```

---

### PR-1 wrap-up

- [ ] Push: `git push`
- [ ] Open PR `feature/subdomain-tenant-routing` → `develop`. Title: `feat(tenant): subdomain-based tenant resolution`. Description: link the spec; list tasks 1–7.
- [ ] Wait for CI green; merge after review.

---

# PR-2 — Schema constraint + slug normalization migration

### Task 8: Schema annotation

**Files:**
- Modify: `apps/backend/prisma/schema/platform.prisma`

- [ ] **Step 1: Annotate `slug`**

In `model Organization`, change:

```prisma
slug String @unique
```

to:

```prisma
/// Subdomain-safe slug. Format enforced by DB CHECK "Organization_slug_subdomain_chk":
/// ^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$ (3–30 chars, lowercase, hyphens allowed mid-string only).
slug String @unique @db.VarChar(30)
```

- [ ] **Step 2: Generate Prisma client to confirm schema compiles**

```
cd apps/backend && npx prisma generate
```
Expected: `Generated Prisma Client (...)` with no errors.

- [ ] **Step 3: Commit**

```
git add apps/backend/prisma/schema/platform.prisma
git commit -m "chore(schema): annotate Organization.slug as VarChar(30) with CHECK doc"
```

---

### Task 9: Migration — backfill + CHECK constraint

**Files:**
- Create: `apps/backend/prisma/migrations/<timestamp>_organization_slug_subdomain_safe/migration.sql`

- [ ] **Step 1: Generate the migration skeleton**

```
cd apps/backend && npx prisma migrate dev --create-only --name organization_slug_subdomain_safe
```
This creates an empty migration folder (because the schema-only change in Task 8 didn't produce DDL on its own — VarChar(30) might generate a TYPE alter; merge with the SQL below).

- [ ] **Step 2: Write the SQL**

Open the new `migration.sql` and replace its contents with:

```sql
-- 1) Tighten column type (no-op if Prisma already added it)
ALTER TABLE "Organization" ALTER COLUMN "slug" TYPE VARCHAR(30) USING substr("slug", 1, 30);

-- 2) Backfill: rewrite any slug that violates the new pattern.
DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  i INT;
BEGIN
  FOR r IN
    SELECT id, slug
    FROM "Organization"
    WHERE slug !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$'
  LOOP
    -- Lowercase, replace runs of underscore/space with hyphen, drop other chars.
    base := lower(r.slug);
    base := regexp_replace(base, '[_\s]+', '-', 'g');
    base := regexp_replace(base, '[^a-z0-9-]', '', 'g');
    base := regexp_replace(base, '-{2,}', '-', 'g');
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    IF length(base) < 3 THEN
      base := substr(base || 'org', 1, 3);
    END IF;
    IF length(base) > 30 THEN
      base := regexp_replace(substr(base, 1, 30), '-+$', '', 'g');
    END IF;

    candidate := base;
    i := 2;
    WHILE EXISTS (SELECT 1 FROM "Organization" WHERE slug = candidate AND id <> r.id) LOOP
      candidate := substr(base, 1, 30 - length('-' || i::text)) || '-' || i::text;
      i := i + 1;
      IF i > 50 THEN
        RAISE EXCEPTION 'Slug normalization exhausted suffixes for org %', r.id;
      END IF;
    END LOOP;

    RAISE NOTICE 'Renaming slug for org %: % -> %', r.id, r.slug, candidate;
    UPDATE "Organization" SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Add the CHECK constraint.
ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_slug_subdomain_chk"
  CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$');
```

- [ ] **Step 3: Apply against the local dev DB**

```
cd apps/backend && npx prisma migrate dev
```
Expected: migration applied; any RAISE NOTICE lines about renames are visible in the output.

- [ ] **Step 4: Verify**

```
cd apps/backend && npx prisma studio  # spot check Organization rows; close after
```
Spot-check: every `slug` matches the regex.

- [ ] **Step 5: Add a brief block comment at the top of the generated migration file documenting that it is destructive (alters slugs)**

```sql
-- WARNING: This migration RENAMES slugs that don't satisfy the new CHECK constraint.
-- Old slugs become unreachable as subdomains immediately. Affected orgs are logged
-- via RAISE NOTICE during apply. Coordinate with operators before running on prod.
```

- [ ] **Step 6: Commit**

```
git add apps/backend/prisma/migrations
git commit -m "feat(db): normalize slugs and add subdomain CHECK constraint"
```

---

### PR-2 wrap-up

- [ ] Push, open PR. Title: `feat(db): subdomain-safe slug constraint + backfill`. Body must explicitly call out the destructive backfill so reviewers see it.
- [ ] Run on staging first; collect the `RAISE NOTICE` output and attach to the PR before merging to main.

---

# PR-3 — Admin wizard slug UX

### Task 10: Slug auto-derive in `org-step.tsx`

**Files:**
- Modify: `apps/admin/features/organizations/create-tenant/steps/org-step.tsx`

- [ ] **Step 1: Read the current component**

```
sed -n '1,200p' apps/admin/features/organizations/create-tenant/steps/org-step.tsx
```

Identify: where `nameAr` is captured; where `slug` is captured; how the form lib (likely React Hook Form) is wired.

- [ ] **Step 2: Add a TS port of the slug generator usable in the browser**

Create `apps/admin/lib/slug.ts`:

```ts
const AR_TO_LATIN: Record<string, string> = {
  'ا':'a','أ':'a','إ':'a','آ':'a','ى':'a',
  'ب':'b','ت':'t','ث':'th',
  'ج':'j','ح':'h','خ':'kh',
  'د':'d','ذ':'dh',
  'ر':'r','ز':'z',
  'س':'s','ش':'sh',
  'ص':'s','ض':'d',
  'ط':'t','ظ':'z',
  'ع':'a','غ':'gh',
  'ف':'f','ق':'q',
  'ك':'k','ل':'l',
  'م':'m','ن':'n',
  'ه':'h','ة':'h',
  'و':'w','ؤ':'w',
  'ي':'y','ئ':'y',
  'ء':'',
};

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
export const SLUG_MIN_LEN = 3;
export const SLUG_MAX_LEN = 30;
export const RESERVED_SUBDOMAINS = new Set([
  'www','api','admin','app','auth','dashboard','login','signup','register',
  'billing','settings','public','static','_next','support','help','docs',
  'cdn','mail','smtp','ftp','ns','mx','staging','status','blog','deqah','root','system',
]);

export function generateSubdomainSafeSlug(input: string): string {
  let s = '';
  for (const ch of input ?? '') s += AR_TO_LATIN[ch] ?? ch;
  s = s.toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length === 0) s = 'org';
  if (s.length > SLUG_MAX_LEN) s = s.slice(0, SLUG_MAX_LEN).replace(/-+$/g, '');
  if (s.length < SLUG_MIN_LEN) s = (s + 'org').slice(0, SLUG_MIN_LEN);
  return SLUG_REGEX.test(s) ? s : 'org';
}

export type SlugValidation = { ok: true } | { ok: false; reason: string };
export function validateSlug(slug: string): SlugValidation {
  if (slug.length < SLUG_MIN_LEN || slug.length > SLUG_MAX_LEN) {
    return { ok: false, reason: `between ${SLUG_MIN_LEN}–${SLUG_MAX_LEN} characters` };
  }
  if (!SLUG_REGEX.test(slug)) return { ok: false, reason: 'lowercase letters, digits, hyphens; no leading/trailing hyphen' };
  if (RESERVED_SUBDOMAINS.has(slug)) return { ok: false, reason: 'this name is reserved' };
  return { ok: true };
}
```

- [ ] **Step 3: Wire into `org-step.tsx`**

Add a `useEffect` that watches `nameAr` and calls `setValue('slug', generateSubdomainSafeSlug(nameAr))` only when the user has not manually edited `slug`. Track manual edits with a ref or a `slugDirty` flag (set true on `onChange` of the slug field).

Show a preview line under the slug input:

```tsx
<p className="text-sm text-muted-foreground">
  https://{slug || '<slug>'}.deqah.net
</p>
```

Show inline validation using `validateSlug(slug)`.

- [ ] **Step 4: Verify in dev**

```
cd apps/admin && npm run dev
```
Open the create-tenant wizard, type an Arabic name, confirm slug auto-fills and preview updates. Edit slug manually; confirm auto-fill stops overriding.

- [ ] **Step 5: Commit**

```
git add apps/admin/lib/slug.ts apps/admin/features/organizations/create-tenant/steps/org-step.tsx
git commit -m "feat(admin): auto-derive slug from name with live preview + validation"
```

---

### Task 11: Admin slug-edit on existing tenant

**Files:**
- Inspect first: `apps/admin/features/organizations/edit-tenant/` (or wherever org settings live; if not present, skip this task and note in PR description).

- [ ] **Step 1: Locate edit surface**

```
ls apps/admin/features/organizations/
ls apps/admin/app/(admin)/organizations/
```
Pick the existing edit page/dialog. If none exists, this task is a no-op — record it in the PR body and skip Steps 2–6.

- [ ] **Step 2: Add slug input + confirmation modal**

Reuse `validateSlug` from `apps/admin/lib/slug.ts`. On submit, show a dialog:

> Changing the slug will break the existing subdomain `https://<old>.deqah.net` for up to 5 minutes (cache TTL). Existing bookmarks and shared links will need to be updated. Continue?

- [ ] **Step 3: Backend handler invalidates cache**

Find the existing update-org handler (likely under `apps/backend/src/modules/platform/admin/`). After the DB update, call:

```ts
this.subdomainResolver.invalidate(oldSlug);
this.subdomainResolver.invalidate(newSlug);
```

Inject `SubdomainResolverService` into the handler's module if not already.

- [ ] **Step 4: Test the handler**

Add a unit test asserting `invalidate` is called for both slugs on rename.

- [ ] **Step 5: Run tests**

```
cd apps/backend && npx jest src/modules/platform/admin
```

- [ ] **Step 6: Commit**

```
git add <touched files>
git commit -m "feat(admin): allow slug rename with confirmation + cache invalidation"
```

---

### Task 12: i18n + small polish

- [ ] **Step 1: Add translations**

For every new user-facing string (preview hint, validation messages, confirmation modal copy), add keys to `apps/admin/messages/ar.json` and `apps/admin/messages/en.json`. Run `npm run i18n:verify` if the script exists.

- [ ] **Step 2: Commit**

```
git add apps/admin/messages
git commit -m "i18n(admin): add slug wizard strings (AR/EN)"
```

---

### PR-3 wrap-up

- [ ] Push, open PR. Title: `feat(admin): slug auto-derivation + edit UX`. Note in body that PR-2 must merge first (DB constraint + backfill) so existing tenants pass validation.

---

# PR-4 — Dashboard host preservation + CORS + Nginx + e2e

### Task 13: Dashboard middleware forwards Host

**Files:**
- Create: `apps/dashboard/middleware.ts` (or extend if already exists)

- [ ] **Step 1: Check for existing middleware**

```
ls apps/dashboard/middleware.ts
```

If it exists, extend; if not, create.

- [ ] **Step 2: Implement**

```ts
// apps/dashboard/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/api/proxy/:path*'],
};

export function middleware(req: NextRequest) {
  const host = req.headers.get('host');
  if (!host) return NextResponse.next();
  const headers = new Headers(req.headers);
  // Forward original host so backend SubdomainResolverService can read it
  if (!headers.has('x-forwarded-host')) headers.set('x-forwarded-host', host);
  return NextResponse.next({ request: { headers } });
}
```

If a middleware file exists with other matchers, merge `/api/proxy/:path*` into the existing matcher and add the header injection block; do not duplicate the file.

- [ ] **Step 3: Manual smoke test**

```
cd apps/dashboard && npm run dev
```

```
curl -i -H 'Host: sawa.localhost:5103' http://localhost:5103/api/proxy/public/branding
```
Expected: backend log line includes the forwarded host. (Add a one-liner `console.log` temporarily inside the resolver if needed — REMOVE it before commit.)

- [ ] **Step 4: Commit**

```
git add apps/dashboard/middleware.ts
git commit -m "feat(dashboard): forward original Host on /api/proxy/* for tenant resolution"
```

---

### Task 14: Backend CORS — wildcard regex

**Files:**
- Modify: `apps/backend/src/main.ts`

- [ ] **Step 1: Failing test**

Create `apps/backend/test/e2e/cors-subdomain.e2e-spec.ts` (or extend existing CORS spec if present):

```ts
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { INestApplication } from '@nestjs/common';

describe('CORS — wildcard subdomain', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PLATFORM_ROOT_DOMAIN = 'deqah.net';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => app && (await app.close()));

  it('allows https://sawa.deqah.net', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'https://sawa.deqah.net')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBe('https://sawa.deqah.net');
  });

  it('blocks https://evil.com', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'https://evil.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd apps/backend && npm run test:e2e -- test/e2e/cors-subdomain.e2e-spec.ts
```

- [ ] **Step 3: Replace `enableCors` block in `main.ts`**

```ts
const rootDomain = process.env.PLATFORM_ROOT_DOMAIN || 'localhost';
const escaped = rootDomain.replace(/\./g, '\\.');
const wildcardRegex = new RegExp(`^https?://([a-z0-9-]+\\.)?${escaped}(:\\d+)?$`, 'i');
const fixedAllowed = (process.env.CORS_ORIGINS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const devDefaults = process.env.NODE_ENV === 'production'
  ? []
  : ['http://localhost:3000', 'http://localhost:5103', 'http://localhost:5104', 'http://localhost:5105'];

app.enableCors({
  origin: (requestOrigin, cb) => {
    if (!requestOrigin) return cb(null, true);
    if (wildcardRegex.test(requestOrigin)) return cb(null, true);
    if (fixedAllowed.includes(requestOrigin)) return cb(null, true);
    if (devDefaults.includes(requestOrigin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${requestOrigin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Org-Id'],
});
```

- [ ] **Step 4: Run — expect PASS**

```
cd apps/backend && npm run test:e2e -- test/e2e/cors-subdomain.e2e-spec.ts
```

- [ ] **Step 5: Commit**

```
git add apps/backend/src/main.ts apps/backend/test/e2e/cors-subdomain.e2e-spec.ts
git commit -m "feat(cors): allow wildcard subdomains of PLATFORM_ROOT_DOMAIN"
```

---

### Task 15: Subdomain isolation e2e

**Files:**
- Create: `apps/backend/test/e2e/security/subdomain-isolation.e2e-spec.ts`

- [ ] **Step 1: Write spec**

```ts
import * as request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';

describe('Subdomain isolation — /public/branding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: { id: string; slug: string };
  let orgB: { id: string; slug: string };

  beforeAll(async () => {
    process.env.PLATFORM_ROOT_DOMAIN = 'deqah.net';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.set('trust proxy', 1);
    await app.init();
    prisma = app.get(PrismaService);

    // Seed two orgs and two BrandingConfigs (use real factories already used in e2e suite).
    // Pseudocode — adapt to existing seed helpers in test/e2e/helpers/.
    orgA = await seedOrg(prisma, { slug: 'a-tenant', primary: '#ff0000' });
    orgB = await seedOrg(prisma, { slug: 'b-tenant', primary: '#00ff00' });
  });

  afterAll(async () => {
    await cleanupOrgs(prisma, [orgA.id, orgB.id]);
    await app.close();
  });

  it('returns A branding when Host is a-tenant.deqah.net', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/branding')
      .set('X-Forwarded-Host', 'a-tenant.deqah.net');
    expect(res.status).toBe(200);
    expect(res.body.colorPrimary).toBe('#ff0000');
  });

  it('returns B branding when Host is b-tenant.deqah.net', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/branding')
      .set('X-Forwarded-Host', 'b-tenant.deqah.net');
    expect(res.status).toBe(200);
    expect(res.body.colorPrimary).toBe('#00ff00');
  });

  it('reserved subdomain (admin.deqah.net) does not resolve to either tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/branding')
      .set('X-Forwarded-Host', 'admin.deqah.net');
    // Falls through to default; whatever default branding returns, it must NOT
    // equal either A or B specific colors.
    expect(res.status).toBe(200);
    expect([orgA, orgB].some((o) => res.body.organizationId === o.id)).toBe(false);
  });
});
```

(The `seedOrg`/`cleanupOrgs` helpers exist in the e2e suite — use the matching pattern from any other `test/e2e/security/*.spec.ts` file.)

- [ ] **Step 2: Run — expect PASS** (resolver, middleware, CORS, and migration are already in place from PR-1/PR-2)

```
cd apps/backend && npm run test:e2e -- test/e2e/security/subdomain-isolation.e2e-spec.ts
```

- [ ] **Step 3: Commit**

```
git add apps/backend/test/e2e/security/subdomain-isolation.e2e-spec.ts
git commit -m "test(e2e): subdomain-based tenant isolation on /public/branding"
```

---

### Task 16: Nginx documentation

**Files:**
- Modify: `docs/operations/deployment-guide.md` (or the equivalent ops doc)

- [ ] **Step 1: Append a section**

Add a section titled **"Subdomain tenant routing"** with:

````markdown
### Subdomain tenant routing

Tenants reach the dashboard at `https://<slug>.deqah.net`. Cloudflare provides wildcard DNS + universal SSL for `*.deqah.net`. Origin Nginx must:

```nginx
server {
  listen 443 ssl http2;
  server_name *.deqah.net;

  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;

  # …existing locations (proxy_pass to dashboard:5103, backend:5100, …)
}
```

Required env vars on backend:

- `PLATFORM_ROOT_DOMAIN=deqah.net`
- `RESERVED_SUBDOMAINS=` (optional CSV, merged with built-in reserved list)
````

- [ ] **Step 2: Commit**

```
git add -f docs/operations/deployment-guide.md
git commit -m "docs(ops): document subdomain tenant routing requirements"
```

---

### PR-4 wrap-up

- [ ] Push, open PR. Title: `feat(routing): subdomain branding + CORS + e2e`. Note that PR-1, PR-2, PR-3 must be merged first.
- [ ] After merge, run staging smoke: visit two tenants on different subdomains; confirm branded login.
- [ ] Production rollout: set env vars; reload Nginx; monitor `TenantResolutionError` and CORS rejection logs for 24h.

---

## Acceptance (Definition of Done)

- [ ] `<slug>.deqah.net/login` shows tenant branding before authentication.
- [ ] Two tenants on two subdomains see only their own data.
- [ ] Slug regex enforced in DTO and DB; existing slugs migrated without data loss.
- [ ] Admin wizard auto-fills slug, previews `https://<slug>.deqah.net`, blocks reserved words.
- [ ] All new + existing tenant-isolation tests pass.
- [ ] `apps/mobile`, `apps/marketing`, `apps/website` untouched.
- [ ] Nginx + CORS documented; production env vars set.
