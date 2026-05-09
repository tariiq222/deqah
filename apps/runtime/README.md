# Deqah Runtime Orchestration System

Part of the Deqah AI Engineering Platform. Provides launch readiness validation and error detection for critical flows.

## Modules

### `launch/readiness`
Pre-launch validation checker. Validates:
- Schema integrity
- Tenant isolation (RLS)
- Security posture
- Critical flows
- Data integrity
- API documentation
- Environment config
- Code quality

### `audit/detector`
Error detection system for critical flows:
- Auth flow errors
- Booking flow errors
- Payment flow errors
- Tenant isolation errors
- Data corruption patterns

## Usage

```typescript
import { runLaunchReadiness, runErrorDetection } from '@deqah/runtime';

// Run all checks before launch
const readiness = await runLaunchReadiness();
if (!readiness.ready) {
  console.error(`${readiness.failed} checks failed`);
}

// Detect errors in specific flow
const errors = await runErrorDetection('auth');
const allErrors = await runErrorDetection('all');
```

## CLI

```bash
# Launch readiness
npx tsx src/launch/readiness.ts

# Error detection (all flows)
npx tsx src/audit/detector.ts

# Error detection (specific flow)
npx tsx src/audit/detector.ts --flow=auth
npx tsx src/audit/detector.ts --flow=bookings
npx tsx src/audit/detector.ts --flow=payments
npx tsx src/audit/detector.ts --flow=tenant
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | Critical issues found |

## Architecture

```
apps/runtime/src/
├── launch/
│   └── readiness.ts     ← Launch Readiness Checker
├── audit/
│   └── detector.ts      ← Error Detection System
└── index.ts
```

## Integration with Orchestration

These modules are part of the Runtime Orchestration System and can be invoked:

1. **Before production deployment** - Run `runLaunchReadiness()`
2. **As part of CI/CD pipeline** - Exit codes used for pass/fail
3. **During development** - Detect errors early in specific flows
4. **Orchestration Audit Agent** - Uses these for compliance verification

## Design Principles

- **Read-only analysis** - No modifications to codebase
- **Fast execution** - Static analysis only, no runtime tests
- **Actionable output** - Clear PASS/FAIL with file locations
- **CLI + API** - Can be used programmatically or via CLI
