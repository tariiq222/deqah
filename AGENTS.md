# Deqah AI Engineering Runtime

> **Status:** Active — Event-Driven Orchestration
> **Last Updated:** 2026-05-09

---

## Philosophy

**No module-to-agent binding.** Any agent can execute any task if it has the right capability. Selection is automatic based on capability matching. System is event-driven — parallel services, not linear pipeline.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EVENT-DRIVEN ORCHESTRATION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│   │  Policy     │  │  Tracing     │  │  Budget      │  │  Graph       │  │
│   │  Engine     │  │  Service     │  │  Governor    │  │  Engine      │  │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│          │                  │                  │                  │          │
│          └──────────────────┼──────────────────┼──────────────────┘          │
│                             │                  │                             │
│                    ┌────────┴──────────────────┴────────┐                   │
│                    │         EVENT BUS (Internal)        │                   │
│                    └──────────────────┬──────────────────┘                   │
│                                       │                                      │
│                    ┌──────────────────┴──────────────────┐                   │
│                    │       Temporal (Workflow Engine)    │                   │
│                    └──────────────────┬──────────────────┘                   │
│                                       │                                      │
│          ┌────────────────────────────┼────────────────────────────┐         │
│          │                            │                            │         │
│   ┌──────┴──────┐          ┌────────┴────────┐          ┌────────┴────────┐  │
│   │  Sandbox    │          │   Agent Pool    │          │  Memory Store  │  │
│   │  Service   │          │                 │          │   (Runtime)   │  │
│   └────────────┘          └─────────────────┘          └────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Task Lifecycle — 3 Tracks

### Automated Gates Track

```
TASK_CREATED
    │
    ▼
IMPACT_ANALYZED ──▶ ANALYZER_ERROR ──▶ ESCALATED
    │
    ▼
ROUTED
    │
    ▼
PLANNED ──▶ PLAN_ERROR ──▶ ESCALATED
    │
    ▼
SANDBOX_APPROVED
    │
    ├──▶ BLOCKED ──▶ ESCALATED (destructive edit detected)
    │
    ▼
EXECUTING
    │
    ├──▶ EXECUTION_ERROR ──▶ RETRYING (max 3)
    │                              │
    │                              ├──▶ RETRY_EXHAUSTED ──▶ ESCALATED
    │                              └──▶ RECOVERED ──▶ EXECUTING
    │
    ▼
TESTING ──▶ TEST_ERROR ──▶ EXECUTING (re-run)
    │
    ▼
LINT_PASSED
    │
    ▼
TYPECHECK_PASSED
    │
    ▼
READY_FOR_APPROVAL
```

### Approval Track (Normal Flow — NOT a failure)

```
PENDING_APPROVAL
    │
    ├──▶ APPROVED ──▶ READY_FOR_DEPLOY
    ├──▶ CHANGES_REQUESTED ──▶ EXECUTING (with feedback)
    └──▶ TIMEOUT ──▶ ESCALATED (auto-escalate)
```

### Deployment Track

```
READY_FOR_DEPLOY
    │
    ▼
PRE_DEPLOY_CHECKS
    │
    ├──▶ CAN_ROLLBACK? = NO ──▶ ESCALATED (requires manual approval)
    │
    ▼
DEPLOYING
    │
    ├──▶ DEPLOY_ERROR ──▶ ROLLING_BACK
    │                              │
    │                              ├──▶ ROLLBACK_SUCCESS ──▶ DEPLOYED
    │                              └──▶ ROLLBACK_FAILED ──▶ ESCALATED
    │
    ▼
DEPLOYED ──▶ COMPLETED
```

### Escalation Track (Abnormal State)

```
ESCALATED
    │
    ▼
HUMAN_REVIEW
    │
    ├──▶ APPROVE ──▶ RESUME (back to normal track)
    ├──▶ REJECT ──▶ FAILED
    └──▶ REQUEST_CHANGE ──▶ EXECUTING (with feedback)
```

---

## 3. Pre-Execution Sandbox

**Before any EXECUTING, sandbox validates:**

```typescript
interface SandboxChecks {
  // Destructive edits
  willDeleteFiles: string[];
  willDropTables: string[];
  willTruncateData: boolean;

  // Schema disasters
  willRemoveRequiredField: string[];
  willChangeRelation: string[];

  // Dependency explosions
  willBreakImports: string[];
  willCreateCircularDeps: boolean;

  // Hallucinations
  willCreateConflictingFiles: string[];
}

interface SandboxResult {
  safe: boolean;
  warnings: string[];
  blockers: SandboxBlocker[];
  canRollback: boolean;
}
```

**Blocking types:**
- `DESTRUCTIVE_EDIT` — delete operations
- `SCHEMA_DISASTER` — dangerous Prisma changes
- `DEPENDENCY_EXPLOSION` — will break imports
- `HALLUCINATION` — file conflicts

---

## 4. Rollback Validation

**CAN_ROLLBACK? check before DEPLOYING:**

| Risk Level | Check | Action |
|------------|-------|--------|
| **IMPOSSIBLE** | Cannot rollback | Block deploy + manual approval required |
| **HIGH** | Risky rollback | Block deploy + senior approval |
| **MEDIUM** | Standard rollback | Proceed with rollback plan |
| **LOW** | Easy rollback | Proceed |

**Non-reversible operations (IMPOSSIBLE):**
- `prisma.migration.delete`
- `tenant.data.delete`
- `payment.processed`
- `schema.column.drop`

---

## 5. Runtime Memory

**System learns from experience:**

```
┌────────────────────────────────────────────────────────────────┐
│                      MEMORY QUERIES                             │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  "Which files always break tests?" ──▶ FileHotspot[]           │
│  "Which agents succeed on NestJS?" ──▶ AgentPerf               │
│  "What caused last 5 escalations?" ──▶ FailurePattern[]       │
│  "What is average cost per task type?" ──▶ CostEstimate        │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**Memory types:**
- **Failure Memory** — why tasks fail, how fixed, retry counts
- **Task Patterns** — common flows, file hotspots
- **Agent Performance** — success rate, cost, latency per agent
- **Decision Log** — why tasks were routed, gates passed/failed

---

## 6. Event Bus

**Events are first-class citizens:**

```typescript
type RuntimeEvent =
  | 'TASK_SUBMITTED'
  | 'POLICY_MATCHED'
  | 'SANDBOX_RESULT'
  | 'EXECUTION_STARTED'
  | 'EXECUTION_COMPLETED'
  | 'GATE_PASSED'
  | 'GATE_FAILED'
  | 'BUDGET_EXCEEDED'
  | 'ESCALATION_TRIGGERED'
  | 'HUMAN_DECISION'
  | 'DEPLOYMENT_STARTED'
  | 'DEPLOYMENT_COMPLETED'
  | 'MEMORY_UPDATED';
```

All services subscribe to events and react in parallel.

---

## 7. Policy Engine (from Git)

**Policies in YAML — no hardcoded rules:**

```yaml
# Example: payments policy
- id: payments-require-security
  risk: CRITICAL
  when:
    files:
      - modules/finance/payments/**
  requires:
    - SECURITY_REVIEW
    - ROLLBACK_VALIDATION
  approver: security-team
  sandbox:
    blocking:
      - DESTRUCTIVE_EDIT
      - SCHEMA_DISASTER
```

---

## 8. Capability-Based Agent Selection

**No named agents. Selection by capability match:**

| Required | Selected by |
|----------|-------------|
| `coding` + NestJS | Best available coding agent |
| `analysis` + large context | Analysis agent |
| `security` + payments | Security-capable agent |
| `execution` + LOW risk | Fast/cheap agent |
| `audit` | Orchestration Audit Agent |

**Selection criteria:**
1. Capability match (type + specialization)
2. Risk level compatibility
3. File scope permissions
4. Cost + latency optimization

---

## 9. Orchestration Audit Agent

**Type:** Monitoring & Compliance (read-only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION AUDIT AGENT                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Subscribes to Event Bus — observes all events                              │
│   Reads: ActivityLog, SuperAdminActionLog, Runtime DB                       │
│   Generates: Daily Reports, Alerts, Compliance Evidence                      │
│                                                                              │
│   Audits:                                                                   │
│   ├── Orchestration Flow Integrity    ← Are tasks following correct path?     │
│   ├── Data Integrity                ← Are audit logs append-only?           │
│   ├── Security Posture               ← Any unauthorized access attempts?      │
│   ├── Agent Behavior                ← Are agents behaving correctly?         │
│   └── User Flow Compliance          ← Did users follow correct flows?         │
│                                                                              │
│   Commands:                                                                  │
│   /audit daily          ← Daily audit report                                 │
│   /audit security       ← Security posture audit                             │
│   /audit flow          ← Orchestration flow audit                           │
│   /audit integrity     ← Data integrity audit                               │
│   /audit compliance    ← Generate compliance evidence                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Forbidden Actions (read-only):**
- ❌ Executes code
- ❌ Modifies any file or database record
- ❌ Overrides policies or security controls
- ❌ Deletes audit logs

**Full spec:** `docs/ai/ORCHESTRATION_AUDIT_AGENT.md`

---

## 10. Execution Paths

| Path | When | Budget |
|------|------|--------|
| **FAST** | Single file, LOW risk | 5K–15K tokens |
| **STANDARD** | Multi-file, moderate impact | 30K–80K tokens |
| **DEEP** | Schema, security, multi-tenant | 150K–500K tokens |

---

## 11. Approval vs Escalation

> **Critical: These are NOT the same**

| Approval (Normal) | Escalation (Abnormal) |
|-------------------|----------------------|
| Task waiting for human | Something went wrong |
| Expected in workflow | Unexpected failure |
| PENDING_APPROVAL | ESCALATED |
| CHANGES_REQUESTED | HUMAN_REVIEW |
| TIMEOUT → auto-escalate | System needs help |

---

## 12. Forbidden Patterns

- ❌ `any` without justification
- ❌ `@ts-ignore` — use `@ts-expect-error` with issue link
- ❌ `console.log` in production
- ❌ Hardcoded secrets
- ❌ `SELECT *` without `select:`
- ❌ N+1 queries
- ❌ UI text without i18n key
- ❌ Missing RTL support (logical properties only)
- ❌ Hex colors in code (semantic tokens only)
- ❌ Magic numbers without constants
- ❌ Commented-out code
- ❌ Files > 350 lines
- ❌ `prisma db push` (migrations only)
- ❌ Editing existing migrations
- ❌ **Execution without sandbox approval**

---

## 13. Source of Truth

```
Git ──────────────▶ Temporal ──────────────▶ Runtime DB
(Source of Truth)   (Execution State)       (Operational)
```

| System | Responsibility |
|--------|---------------|
| **Git** | Code, policies, schemas, CODEOWNERS |
| **Temporal** | Workflow state, durable execution, retries |
| **Runtime DB** | Metrics, cost, failure history, memory |

---

*Architecture details: `docs/ai/ADR-001-DEQAH-RUNTIME-CORE.md`*
