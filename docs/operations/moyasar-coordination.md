# Moyasar Coordination Spec

> Single source of truth for Moyasar integration across all three flows.
> Owner: `@tariq` (payments are owner-only per root `CLAUDE.md` Security Sensitivity Tiers).
> **Any new Moyasar flow MUST update this document before merge.**

---

## Why this document exists

As of Plan 02e Deqah now has **three distinct Moyasar flows** in active or planned use. Each flow has its own webhook URL, its own idempotency domain, and its own failure-recovery obligations. Without a single coordination document, details drift between plans:

- Plan **02e** booking-payment webhook (merged; owner-gated) — clinic charging its clients for bookings.
- Plan **04** subscription webhook (planned; owner-gated at Task 1) — Deqah charging clinics for SaaS subscriptions. Moyasar has no native subscriptions, so we drive the cycle via a BullMQ cron and the webhook handles async status updates.
- Plan **07** signup charge (planned; owner-gated) — first subscription charge collected during the 5-step signup wizard, BEFORE the Organization row is committed.

Each flow reads and writes into the same Moyasar merchant account, uses the same HMAC signing scheme, and shares the Payment/Invoice/Subscription data model. The coordination risks are concrete: reusing a secret across flows would let one flow forge webhooks for another; mis-matching an idempotency key would cause double-charging; missing a compensation path would leak money to the gateway on partial failures. This document exists to prevent those mistakes.

---

## Flow inventory

| Flow | Plan | Who charges whom | Webhook URL | Secret env var | Charge trigger |
|------|------|------------------|-------------|-----------------|-----------------|
| Booking payment | 02e | Clinic → client | `POST /api/v1/public/payments/moyasar/webhook` | `MOYASAR_SECRET_KEY` | Client initiates via `init-guest-payment` or hosted checkout; Moyasar posts status async |
| Subscription renewal | 04 | Deqah → clinic | `POST /api/v1/public/billing/webhooks/moyasar` | `MOYASAR_SUBSCRIPTION_WEBHOOK_SECRET` | BullMQ cron `charge-due-subscriptions` invokes Moyasar charge API; Moyasar posts status async |
| Signup charge | 07 | Deqah → new clinic owner | `POST /api/v1/public/billing/webhooks/moyasar` (shares with flow 04) | `MOYASAR_SUBSCRIPTION_WEBHOOK_SECRET` | Synchronous server-side charge via `moyasar-api.client.ts` during `POST /api/v1/public/signup`; webhook only used for delayed async reconciliation |

Rules encoded in this table:

- **Booking webhook and subscription/signup webhook are SEPARATE routes with SEPARATE secrets.** Moyasar dashboard must be configured with both URLs and both secrets.
- **Subscription renewal (04) and signup charge (07) share the subscription webhook URL.** The handler dispatches on `metadata.invoiceType` (`"subscription"` vs `"signup"`); secret is shared because the calls originate from the same Moyasar merchant account.
- **No flow uses `MOYASAR_SECRET_KEY` for a non-booking event.** Any code that verifies a subscription or signup webhook signature with `MOYASAR_SECRET_KEY` is a bug.

---

## Shared infrastructure (build once, reuse)

### 1. Signature verification helper

A single helper in `src/modules/finance/moyasar/verify-signature.ts`:

```ts
import { createHmac, timingSafeEqual } from 'crypto';
import { BadRequestException } from '@nestjs/common';

export function verifyMoyasarSignature(rawBody: string, signature: string, secret: string): void {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const signatureBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== signatureBuf.length || !timingSafeEqual(expectedBuf, signatureBuf)) {
    throw new BadRequestException('Invalid Moyasar webhook signature');
  }
}
```

Every webhook handler calls this helper with its own secret. No handler re-implements HMAC locally. A unit test exists at `src/modules/finance/moyasar/verify-signature.spec.ts` covering: valid signature, wrong secret, truncated signature (timing-attack defense), missing signature.

### 2. Raw body middleware

Express `bodyParser.json({ verify })` captures the raw body on all webhook routes. Both `/public/payments/moyasar/webhook` and `/public/billing/webhooks/moyasar` are included in the raw-body route list. The raw body is needed because `JSON.parse` + `JSON.stringify` is not reversible (whitespace changes).

### 3. 3-stage tenant resolution pattern

All THREE webhook flows MUST use the pattern introduced in Plan 02e:

1. **Verify HMAC signature** (pure crypto; no DB).
2. **Resolve tenant** by looking up the anchor row (Invoice / SubscriptionInvoice / Subscription) under the `SYSTEM_CONTEXT_CLS_KEY` bypass. This is a cross-tenant read authorized by the signed payload.
3. **Enter tenant `cls.run`** with the resolved `organizationId`. All subsequent mutations auto-scope through the Prisma Proxy and satisfy RLS.

Reference implementation: `src/modules/finance/moyasar-webhook/moyasar-webhook.handler.ts` (Plan 02e). Subscription and signup webhook handlers (Plans 04 and 07) MUST mirror this structure. Any deviation requires owner review and a written exception in this document.

### 4. Amount conversion

Moyasar expresses amounts in **halalas** (1 SAR = 100 halalas). Every flow converts to SAR at the boundary:

```ts
const amountSar = payload.amount / 100;
```

This is consistent across all three flows. Do not store halalas in the domain model — always convert at the webhook handler and at the charge call site.

### 5. Moyasar adapter surface

Single adapter at `src/modules/finance/moyasar-api/moyasar-api.client.ts` exposes:

- `chargeBooking({ amount, token, invoiceId })` — flow 02e
- `chargeSubscription({ amount, customerId, sourceId, subscriptionInvoiceId })` — flow 04
- `chargeSignup({ amount, token, metadata })` — flow 07 (synchronous, returns `PaymentStatus`)
- `refund({ chargeId, reason })` — shared, used by all flows for compensation

All four methods use the same HTTP client, same `sk_*` key (per env), same retry policy (3 retries with exponential backoff on 5xx; no retry on 4xx). Test keys (`sk_test_*`) are used exclusively under `MOYASAR_TEST_MODE=true`.

---

## Idempotency keys

Every Payment row has an `idempotencyKey` column with a unique index. Format is prefix + external id:

| Flow | Key format | Reasoning |
|------|-----------|-----------|
| Booking (02e) | `moyasar:booking:<moyasar_payment_id>` | Moyasar's own id; cannot collide with subscription |
| Subscription renewal (04) | `moyasar:subscription:<subscription_invoice_id>` | Internal id because Moyasar's id is assigned AFTER we attempt the charge |
| Signup (07) | `moyasar:signup:<signup_attempt_uuid>` | UUID generated before calling the charge API; guarantees no retry double-charges |

Rules:

- **Prefix is required.** Prevents cross-flow collisions if Moyasar ever reuses an id across event types.
- **Idempotency check happens before the `upsert`.** Each webhook handler performs `prisma.payment.findFirst({ where: { idempotencyKey, status: COMPLETED } })` under system context; if found, return `{ skipped: true }`.
- **Flow 07 generates the UUID synchronously and persists it to `SignupAttempt.moyasarIdempotencyKey` BEFORE calling Moyasar.** This is the fix for the "charge-then-DB-failure" bug called out in the PR #22 review. See "Compensation" section below.

---

## Refund / compensation obligations

Every flow that takes money MUST have a documented compensation path when the downstream DB write fails. Failure to do so leaks money to the gateway without a corresponding receipt.

### Flow 02e (booking payment) — no compensation needed

Moyasar charge happens AFTER the Invoice row is already committed (the charge is initiated by the client against an existing invoice). If the webhook's post-charge DB write fails, the `idempotencyKey` ensures the next webhook retry idempotently completes the Payment row. No money is ever sent before the invoice exists.

### Flow 04 (subscription renewal) — refund on state-machine failure

Cron invokes `MoyasarAdapter.chargeSubscription(...)` → receives success → attempts to insert `Payment` + advance `Subscription.currentPeriodEnd`. If the DB transaction fails:

- Call `MoyasarAdapter.refund({ chargeId, reason: 'subscription-state-machine-failure' })` in the catch block.
- Log the refund attempt to `SuperAdminActionLog` (if `Plan 05b` is live) or a structured log with `level: error`.
- Alert on `moyasar.refund.count > 0` in Prometheus — any refund outside normal customer-initiated refund flow is an operational incident.

### Flow 07 (signup) — split transaction, synchronous compensation (MUST)

The signup wizard calls Moyasar SYNCHRONOUSLY to charge the first subscription cycle before the `$transaction` that creates `Organization + User + Membership + Subscription + seeds`. This ordering is the ONLY way to reject the signup if payment fails. BUT it creates a money-at-risk window if the `$transaction` fails after Moyasar succeeds.

**Required implementation:**

```ts
async execute(dto: SignupDto) {
  const idempotencyKey = randomUUID();

  // 1. Pre-flight slug / email checks (cheap reads, no side effects).
  await this.assertAvailable(dto);

  // 2. Charge Moyasar.
  const charge = await this.moyasar.chargeSignup({
    amount: dto.plan.firstCycleSarAmount,
    token: dto.moyasarPaymentToken,
    metadata: { idempotencyKey, invoiceType: 'signup' },
  });
  if (charge.status !== 'paid') {
    throw new PaymentDeclinedException(charge.message);
  }

  // 3. Commit DB under a transaction with Moyasar-refund compensation.
  try {
    return await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: /* ... */ });
      await tx.user.create({ data: /* ... */ });
      await tx.membership.create({ data: /* ... */ });
      await tx.subscription.create({ data: {
        organizationId: org.id,
        moyasarChargeId: charge.id,
        idempotencyKey,
        // ...
      } });
      // seeds, welcome email job, etc.
      return { organizationId: org.id };
    });
  } catch (err) {
    // MUST refund — money is at Moyasar without a corresponding Organization.
    await this.moyasar.refund({
      chargeId: charge.id,
      reason: `signup-transaction-rollback: ${err.message}`,
    });
    throw err;
  }
}
```

**Additional guarantees:**

- The refund call itself is retried (via the adapter's retry policy). If it still fails, emit a `signup.refund.failed` event that pages the owner.
- The `SignupAttempt` row (if we add one — TBD during Plan 07 execution) persists `idempotencyKey + chargeId` BEFORE step 2. On replay of a failed signup, the handler checks this row first and refunds any orphan charges.
- Test coverage MUST include: Moyasar success → `$transaction` throws (e.g., slug collision) → assert `refund` was called with the correct `chargeId`.

---

## Webhook URL / metadata contract

### Booking (02e)

- URL: `POST /api/v1/public/payments/moyasar/webhook`
- Metadata: `{ invoiceId: "<uuid>" }` — required.
- Event types accepted: `paid`, `failed`, `refunded`.
- Handler: `MoyasarWebhookHandler.execute()`.

### Subscription + signup (04 / 07)

- URL: `POST /api/v1/public/billing/webhooks/moyasar`
- Metadata: `{ invoiceType: "subscription" | "signup", subscriptionInvoiceId?: "<uuid>", signupAttemptId?: "<uuid>" }` — `invoiceType` is required; exactly one of the two ids is required.
- Event types accepted: `paid`, `failed`, `authorization_captured`, `authorization_voided`.
- Handler: `SubscriptionMoyasarWebhookHandler.execute()` (Plan 04). Dispatches on `metadata.invoiceType`.

### Unknown / malformed metadata

Every handler returns `{ skipped: true }` with a `warn` log if required metadata is missing. This is intentional — Moyasar retries on non-2xx, so we acknowledge unknown events but don't error on them.

---

## Secret management

- Secrets live in `.env` at `apps/backend/.env` (local dev), `.env.test` (CI + test DB), and K8s/Fly secrets at prod.
- **Never check a real key into git.** The `.env.example` file contains placeholder-only values.
- Rotation: owner rotates both `MOYASAR_SECRET_KEY` and `MOYASAR_SUBSCRIPTION_WEBHOOK_SECRET` separately and independently. The Moyasar dashboard allows multiple active secrets per webhook URL during rotation to enable zero-downtime swap.
- Secret scope enforcement: the booking handler in 02e MUST refuse to boot if `MOYASAR_SUBSCRIPTION_WEBHOOK_SECRET` is read instead of `MOYASAR_SECRET_KEY`. Typed config accessor enforces this (no `config.get<string>('MOYASAR_*')` with dynamic key in handlers).

---

## Observability

All three flows emit the same structured log keys so Sentry / Prometheus dashboards can be shared:

```ts
{
  flow: 'booking' | 'subscription' | 'signup',
  event: 'webhook.received' | 'webhook.skipped' | 'charge.success' | 'charge.failed' | 'refund.issued',
  organizationId: string | null, // null when in stage 2 before tenant resolution
  idempotencyKey: string,
  moyasarChargeId: string | null,
  amountSar: number,
  durationMs: number,
}
```

Prometheus counters:

- `moyasar_webhook_total{flow, result}` — `result` in `{success, skipped_idempotent, skipped_metadata, signature_rejected}`.
- `moyasar_charge_total{flow, result}` — `result` in `{success, declined, gateway_error}`.
- `moyasar_refund_total{flow, reason}` — `reason` helps distinguish customer-initiated from compensation refunds.

Plan 10 (Hardening) wires these counters into the Prometheus interceptor. Cardinality note: `flow` has 3 values, `result` has ~5, `reason` has ~5 — total series is small. No `organizationId` label here (too high-cardinality for gateway metrics).

---

## Testing matrix

Every flow MUST have ALL of these test classes before merge:

| Test | Booking (02e) | Subscription (04) | Signup (07) |
|------|----|----|----|
| Unit: signature verification | ✅ in `moyasar-webhook.handler.spec.ts` | must add | must add |
| Unit: two-org isolation (tenant resolved from payload) | ✅ in Plan 02e spec | must add | must add |
| Unit: idempotency (duplicate webhook returns `skipped`) | ✅ | must add | must add |
| Unit: metadata missing → `skipped` | ✅ | must add | must add |
| Unit: system-context bypass flag is set then cleared | ✅ | must add | must add |
| Integration: refund on DB failure | n/a (no money at risk) | must add | must add |
| e2e: full happy path with real Moyasar test key | ✅ `moyasar-webhook-idempotency.spec.ts` + `moyasar-webhook-tenant-context.e2e-spec.ts` | must add | must add |
| e2e: two-org isolation — webhook for Org A never creates rows in Org B | ✅ `moyasar-webhook-tenant-context.e2e-spec.ts` | must add | must add |

---

## Owner sign-off requirements

Per root `CLAUDE.md` Security Sensitivity Tiers, every Moyasar-touching commit needs `@tariq` on the reviewer list. This document is part of that gate — a plan that adds or modifies a Moyasar flow without updating this document is incomplete and should be held for amendment.

Specific gates per plan:

- **02e** — gated on Tariq's approval of the initial webhook handler rewrite (PR #21). Merged: this doc reflects that implementation.
- **04** — Task 1 is a hard stop: `/approve saas-04` in PR comments required before any Moyasar-adjacent code is written. The state machine diagram requires separate owner sign-off.
- **07** — entire plan is owner-gated at plan authorship. No task may merge without `@tariq` review. The signup-charge compensation flow (synchronous refund on rollback) is the highest-risk item and MUST be exercised in a test.
- **New Moyasar flow (future)** — must (a) open an amendment PR to this document before any code, (b) secure owner approval of the amendment, (c) then proceed with implementation.

---

## Amendments log

| Date | Plan | Amendment | Approved by |
|------|------|-----------|-------------|
| 2026-04-21 | 02e | Initial document establishing the three-flow inventory and 3-stage tenant resolution pattern | pending owner review |
