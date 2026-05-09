# Deqah Launch Readiness & Error Detection

## Overview

Comprehensive pre-launch validation system for Deqah SaaS platform.

## Scripts

### 1. Launch Readiness Checker

Validates the entire system before production launch:

```bash
node scripts/launch-readiness/index.js
```

**Checks:**
- Schema integrity (all Prisma schemas exist)
- Tenant isolation (RLS policies)
- Security posture (auth, webhooks, rate limiting)
- Critical flows (bookings, payments, billing)
- Data integrity (audit logs, soft deletes)
- Migration health (proper naming, seeds)
- API contract (OpenAPI spec)
- Environment config (.env.example, docker-compose)
- Code quality (ESLint, Prettier, Jest)

---

### 2. Error Detection System

Detects potential errors in critical flows:

```bash
# Check all flows
node scripts/error-detection/index.js

# Check specific flows
node scripts/error-detection/index.js --flow=auth
node scripts/error-detection/index.js --flow=bookings
node scripts/error-detection/index.js --flow=payments
node scripts/error-detection/index.js --flow=tenant
```

**Detects errors in:**

#### Auth Flow
- Missing rate limiting
- Missing account lockout
- Timing attack vulnerabilities
- Missing JWT organizationId
- Token expiration issues

#### Booking Flow
- Missing database transactions
- No double-booking prevention
- Race conditions in group sessions
- Missing plan limit enforcement
- VAT calculation issues

#### Payment Flow
- No webhook signature verification
- Missing idempotency checks
- Amount spoofing vulnerabilities
- Missing partial payment handling

#### Tenant Isolation
- No Prisma tenant extension
- Missing scoped models
- RLS not enforced
- Cross-tenant reference leaks

---

## Combined Pre-Launch Check

```bash
# Run both checks sequentially
node scripts/launch-readiness/index.js && node scripts/error-detection/index.js

# Or use npm script
pnpm run prelaunch
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Critical issues found |

---

## Workflow

```
┌─────────────────────────────────────────────┐
│           PRE-LAUNCH CHECKLIST               │
├─────────────────────────────────────────────┤
│                                             │
│  1. Run launch readiness checker           │
│     └── node scripts/launch-readiness/      │
│                                             │
│  2. Fix any critical issues                │
│                                             │
│  3. Run error detection                    │
│     └── node scripts/error-detection/       │
│                                             │
│  4. Fix critical errors                    │
│                                             │
│  5. Repeat until 0 critical issues         │
│                                             │
│  6. Deploy to production                   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Adding Custom Checks

### Adding a new check to Launch Readiness

```javascript
// In scripts/launch-readiness/index.js

async function checkMyFeature() {
  console.log(`\n${BOLD}━━━ CHECK: My Feature ━━━${RESET}\n`);

  try {
    const fs = await import('fs');
    const path = 'path/to/file.ts';

    if (fs.existsSync(path)) {
      pass('My feature', 'File exists');
    } else {
      fail('My feature', 'File NOT found');
    }
  } catch (error) {
    fail('My feature', `Error: ${error.message}`);
  }
}

// Add to main():
await checkMyFeature();
```

### Adding a new error detection

```javascript
// In scripts/error-detection/index.js

async function detectMyErrors() {
  console.log(`\n${BOLD}━━━ MY ERROR DETECTION ━━━${RESET}\n`);

  const fs = await import('fs');
  const path = 'path/to/file.ts';

  if (fs.existsSync(path)) {
    const content = fs.readFileSync(path, 'utf-8');

    if (!content.includes('expectedPattern')) {
      critical('MY_ERROR', 'Pattern not found', path);
    }
  }
}

// Add to main():
await detectMyErrors();
```

---

## Examples

### Example: Critical issue found

```
[14:32:01] [CRITICAL] [AUTH_BRUTE_FORCE]: No account lockout mechanism (login/login.handler.ts)
[14:32:01] [CRITICAL] [BOOKING_NO_CONFLICT_CHECK]: No double-booking prevention (create-booking/create-booking.handler.ts)

✗ DO NOT LAUNCH

2 critical issues must be fixed.
```

### Example: All clear

```
[14:32:01] [PASS] [Schema file exists]: apps/backend/prisma/schema/identity.prisma
[14:32:01] [PASS] [RLS enforced]: FORCE ROW LEVEL SECURITY is set
...

✓ READY FOR LAUNCH

Report generated: 2026-05-09T11:32:01.000Z
```
