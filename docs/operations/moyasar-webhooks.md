---
status: active
last_reviewed: 2026-05-11
audience: on-call engineers triaging Moyasar webhook incidents
owner: "@tariq"
related:
  - docs/operations/moyasar-coordination.md
  - docs/operations/2026-05-08-secret-rotation-runbook.md
  - docs/operations/p2-credential-rekey-2026-05-09.md
  - docs/operations/rollback-runbook.md
---

# Moyasar Webhooks — Operator Cheat Sheet

> **Status:** active
> **Last reviewed:** 2026-05-11
> **Audience:** on-call engineers triaging Moyasar webhook incidents
> **Why this doc exists:** There are TWO Moyasar webhook flows that share a vendor name but use different secrets, different endpoints, different code paths, and different DB tables. Confusing them during an incident leads to wrong fixes (e.g. rotating the wrong secret, looking in the wrong table, blaming the wrong service).

For the broader design rationale (three-flow inventory including the planned signup charge variant), see `docs/operations/moyasar-coordination.md`. This document is the operator cheat-sheet — concrete paths, concrete tables, concrete triage steps.

---

## TL;DR — Which flow is this?

Identify the flow from the inbound HTTP path. Everything else (secret, code, DB tables) follows from that.

| If the webhook came in on...                          | Flow         | Owner of money               |
| ----------------------------------------------------- | ------------ | ---------------------------- |
| `POST /api/v1/public/billing/webhooks/moyasar`        | **PLATFORM** | Deqah (SaaS subscription)    |
| `POST /api/v1/public/payments/webhook`                | **TENANT**   | The tenant (booking/invoice) |

```
                              ┌──────────────────────┐
                              │   Moyasar gateway    │
                              └──────────┬───────────┘
                                         │  HTTPS POST
                                         │  X-Moyasar-Signature header
                       ┌─────────────────┴────────────────┐
                       │                                  │
                       ▼                                  ▼
       /api/v1/public/billing/webhooks/moyasar    /api/v1/public/payments/webhook
       (Flow 1 — PLATFORM, Deqah charges tenants) (Flow 2 — TENANT, tenant charges clients)
                       │                                  │
                       ▼                                  ▼
       BillingWebhookController                   PublicPaymentWebhookController
       api/public/billing-webhook.controller.ts   api/public/payment-webhook.controller.ts
                       │                                  │
                       ▼                                  ▼
       MoyasarSubscriptionWebhookHandler          MoyasarWebhookHandler
       modules/finance/moyasar-api/...            modules/finance/moyasar-webhook/...
                       │                                  │
                       │ verify with                      │ resolve tenant from
                       │ MOYASAR_PLATFORM_WEBHOOK_SECRET  │ Invoice→Org, decrypt
                       │ (single env var)                 │ OrganizationPaymentConfig
                       │                                  │ .webhookSecretEnc with
                       │                                  │ MOYASAR_TENANT_ENCRYPTION_KEY,
                       │                                  │ then verify
                       ▼                                  ▼
       SubscriptionInvoice / Subscription /       Payment / Invoice / Booking /
       DunningLog / WebhookEvent (dedup)          (downstream events: RefundRequest)
```

A useful mental model: **PLATFORM = one shared Moyasar account that Deqah controls. TENANT = N independent Moyasar accounts, one per organization.** The webhook plumbing is therefore symmetric on the wire (same vendor, same `X-Moyasar-Signature` header) but completely asymmetric inside the application.

---

## Flow 1 — Platform Moyasar (Deqah ↔ tenant SaaS billing)

### Purpose

Deqah uses **one shared Moyasar account** to bill tenants for their SaaS subscription (the BASIC/PRO/etc. plan a clinic pays Deqah for). Charges are initiated by Deqah on a schedule (`charge-due-subscriptions` cron, signup charge, dunning retries, plan-change proration); Moyasar then posts back the asynchronous outcome (`payment_paid` / `payment_failed`) to this webhook.

There is exactly one Moyasar account on the platform side, exactly one secret pair in env, and exactly one webhook URL configured in the Moyasar dashboard for it.

### Endpoint

- **Method + path:** `POST /api/v1/public/billing/webhooks/moyasar`
- **Controller file:** `apps/backend/src/api/public/billing-webhook.controller.ts:7`
- **Handler module:** `apps/backend/src/modules/finance/moyasar-api/moyasar-subscription-webhook.handler.ts`
- **HMAC verification:** `apps/backend/src/modules/finance/moyasar-api/moyasar-subscription.client.ts:148` (`verifyWebhookSignature`)
- **Wiring (DI):** registered in `apps/backend/src/modules/finance/finance.module.ts:31`

The callback URL constructed by all platform-side charge initiators always resolves to this exact path, e.g.:

- `apps/backend/src/modules/platform/billing/charge-due-subscriptions/charge-due-subscriptions.cron.ts:255`
- `apps/backend/src/modules/platform/billing/upgrade-plan/upgrade-plan.handler.ts:309`
- `apps/backend/src/modules/platform/billing/dunning-retry/dunning-retry.service.ts:206`
- `apps/backend/src/modules/platform/billing/expire-trials/expire-trials.cron.ts:358`
- `apps/backend/src/modules/platform/billing/saved-cards/add-saved-card.handler.ts:125`

### Secrets

- `MOYASAR_PLATFORM_SECRET_KEY` — Basic-auth username Deqah uses when calling Moyasar (`POST /v1/payments`, `POST /v1/payments/{id}/refund`, `GET /v1/tokens/{id}`, `DELETE /v1/tokens/{id}`). Validated in `apps/backend/src/config/env.validation.ts:186`. Required in production, optional in dev/test. Read at call time via `config.getOrThrow('MOYASAR_PLATFORM_SECRET_KEY')` in `moyasar-subscription.client.ts`.
- `MOYASAR_PLATFORM_WEBHOOK_SECRET` — HMAC-SHA256 secret used to verify that an inbound webhook actually came from Moyasar. Validated in `apps/backend/src/config/env.validation.ts:191`. Required in production, optional in dev/test.

These two secrets are **process-wide**. They do NOT live in the database. Rotating them requires a deploy (or a runtime env reload, depending on how the platform is hosted).

### What it writes

The handler runs in three stages — verify signature → idempotency dedup → process — and the writes happen in stage three via `RecordSubscriptionPaymentHandler` (success path) or `RecordSubscriptionPaymentFailureHandler` (failure path).

| Step                                | Table                 | Mutation                                                                                                                                                                                       | Source                                                                                                                                                  |
| ----------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idempotency guard (every webhook)   | `WebhookEvent`        | INSERT row with `provider='MOYASAR_PLATFORM'`, `eventId`, `eventType`, `payloadHash`. Unique violation (P2002) → return `{ ok, deduped: true }`.                                                | `moyasar-subscription-webhook.handler.ts:65`                                                                                                            |
| `payment_paid`                      | `SubscriptionInvoice` | UPDATE → `status='PAID'`, `paidAt=now()`, `moyasarPaymentId`                                                                                                                                   | `apps/backend/src/modules/platform/billing/record-subscription-payment/record-subscription-payment.handler.ts`                                          |
| `payment_paid`                      | `Subscription`        | UPDATE → `status` per state machine, `currentPeriodStart`/`currentPeriodEnd` advanced, `pastDueSince=null`, `lastPaymentAt`, `retryCount=0`, `dunningRetryCount=0`, `nextRetryAt=null`         | `record-subscription-payment.handler.ts`                                                                                                                |
| `payment_failed`                    | `SubscriptionInvoice` | UPDATE → `status='FAILED'`, `failureReason`, `attemptCount += 1`, `moyasarPaymentId`                                                                                                           | `apps/backend/src/modules/platform/billing/record-subscription-payment-failure/record-subscription-payment-failure.handler.ts`                          |
| `payment_failed`                    | `Subscription`        | UPDATE → `status` per state machine (ACTIVE/TRIALING → PAST_DUE; PAST_DUE stays), `pastDueSince` set if first failure, `lastFailureReason`, `retryCount += 1`, `nextRetryAt=now+3h` if unset | `record-subscription-payment-failure.handler.ts`                                                                                                        |
| `payment_failed`                    | `DunningLog`          | INSERT row with `attemptNumber=0`, `status='FAILED'`, `moyasarPaymentId`, `failureReason`, `scheduledFor=now`, `executedAt=now`                                                              | `record-subscription-payment-failure.handler.ts`                                                                                                        |
| Mark webhook processed (every call) | `WebhookEvent`        | UPDATE → `processedAt=now`, `result='processed'` or `'error'`                                                                                                                                  | `moyasar-subscription-webhook.handler.ts:87`                                                                                                            |

Both writers run inside `rlsTx.withBypassTransaction(...)` because the platform billing tables are cross-org and the webhook has no inherited tenant CLS context. State transitions are computed by `apps/backend/src/modules/platform/billing/subscription-state-machine.ts`.

### Common payloads

Confirmed handled types (inspect `moyasar-subscription-webhook.handler.ts:138`):

- `payment_paid` → `RecordSubscriptionPaymentHandler.execute`
- `payment_failed` → `RecordSubscriptionPaymentFailureHandler.execute`
- Any other `event.type` → logged at `debug` and swallowed (`{ ok: true }`).

The handler matches on `event.data.id` (Moyasar payment id) against `SubscriptionInvoice.moyasarPaymentId` to find the invoice. If no row matches, the webhook is acknowledged with a warning ("no invoice found for payment …") — this is intentional so unrelated traffic to the URL doesn't 5xx.

### Triage

> Symptom: subscription marked PAID in Moyasar dashboard but Deqah still shows unpaid / PAST_DUE / SUSPENDED.
> 1. Find the Moyasar payment id from the dashboard.
> 2. `SELECT id, "moyasarPaymentId", status, "paidAt" FROM "SubscriptionInvoice" WHERE "moyasarPaymentId" = '<id>';` — if no row matches, the webhook never linked. The platform charge initiator (cron / upgrade / dunning) is responsible for writing `moyasarPaymentId` onto the invoice when it calls `chargeWithToken`. If that write was skipped, the webhook will hit the "no invoice found" branch and silently `{ ok: true }`.
> 3. Check `SELECT * FROM "WebhookEvent" WHERE provider='MOYASAR_PLATFORM' AND "eventId"=...;` — if `result='processed'` and `processedAt` is set, the webhook ran but didn't find the invoice (see step 2). If `result='error'`, look at logs for the handler exception. If no row, the webhook never reached us (next item).
> 4. If no `WebhookEvent` row exists, replay from the Moyasar dashboard (Webhook → Deliveries → Redeliver). See "Replay a missed webhook" below.

> Symptom: signature verification failing (handler throws `UnauthorizedException('Invalid webhook signature')`).
> 1. Confirm `MOYASAR_PLATFORM_WEBHOOK_SECRET` in the running container matches what's currently configured in the Moyasar dashboard. The dashboard secret is what Moyasar HMACs payloads with; the env var is what we expect. Any mismatch fails everything.
> 2. If the secret was just rotated, the platform must have been redeployed for the new value to take effect (env vars are read at process boot via `ConfigService`). Cross-reference `docs/operations/2026-05-08-secret-rotation-runbook.md`.
> 3. Manual sanity check: `printf '%s' '<rawBody>' | openssl dgst -sha256 -hmac "$MOYASAR_PLATFORM_WEBHOOK_SECRET" -hex` — must equal the `X-Moyasar-Signature` header byte-for-byte.

> Symptom: 5xx from `/api/v1/public/billing/webhooks/moyasar`.
> 1. `UnauthorizedException` (401) → bad signature, see above.
> 2. `BadRequestException` (400) → `Malformed webhook payload` (not JSON, or missing `type`/`data.id`). Inspect raw body — usually a misconfigured probe hitting the URL.
> 3. 5xx → handler ran, processing failed. Check logs for the wrapped error; the `WebhookEvent` row will have `result='error'` so you can correlate by `eventId`.

> Symptom: `payment_paid` was processed, but the subscription is still PAST_DUE.
> The state machine allows `PAST_DUE → ACTIVE` on `chargeSuccess`, so this should not happen if the handler ran cleanly. Look for an exception inside `RecordSubscriptionPaymentHandler.execute` after the `WebhookEvent` row was created — `result='error'` with the `Subscription` row untouched.

> Symptom: subscription billed twice for the same period.
> The dedup is `WebhookEvent (provider='MOYASAR_PLATFORM', eventId)` with a unique index. If the same outer `event.id` arrives twice, the second is dropped. If two distinct Moyasar charges happened for the same period, that's a charge-initiator bug (likely the cron re-selecting the same subscription) — not a webhook bug. See `advanceBillingPeriodEnd` in `apps/backend/src/modules/platform/billing/billing-period.util.ts` and the comment in `record-subscription-payment.handler.ts` about Bug B2.

---

## Flow 2 — Tenant Moyasar (tenant ↔ tenant's client)

### Purpose

Each tenant connects **their own Moyasar account** to take payment from their own clients (booking deposits, invoice settlements). Per-tenant credentials (publishable key, secret key, webhook signing secret) are stored encrypted at rest in `OrganizationPaymentConfig`, with a per-tenant key derived via HKDF from the platform-wide master key. There can be hundreds of tenants and therefore hundreds of distinct webhook signing secrets — one per row.

There is exactly **one URL** for all tenants (the URL itself is not tenant-scoped). Tenant identity is recovered from `metadata.invoiceId` embedded by our payment initiator at charge time, then the per-tenant secret is decrypted to verify the HMAC.

### Endpoint

- **Method + path:** `POST /api/v1/public/payments/webhook`
- **Controller file:** `apps/backend/src/api/public/payment-webhook.controller.ts:19`
- **Handler module:** `apps/backend/src/modules/finance/moyasar-webhook/`
  - Handler: `apps/backend/src/modules/finance/moyasar-webhook/moyasar-webhook.handler.ts`
  - Payload DTO: `apps/backend/src/modules/finance/moyasar-webhook/moyasar-webhook.dto.ts`
- **Throttle:** 120 req / 60s per source (`Throttle({ default: { ttl: 60_000, limit: 120 } })` on the controller).
- **Auth:** `@Public()` — no JWT.

### Secrets

- `MOYASAR_TENANT_ENCRYPTION_KEY` — process-level master key, 32 raw bytes base64-encoded (44 ASCII chars). Validated in `apps/backend/src/config/env.validation.ts:109`. Used as IKM for HKDF-SHA256 with `salt='deqah-moyasar-creds-v1'` and `info=organizationId` to derive a unique AES-256-GCM key per tenant. See `apps/backend/src/infrastructure/payments/moyasar-credentials.service.ts:82` (`deriveKey`).
- **Per-tenant actual secrets** live encrypted in `OrganizationPaymentConfig` rows:
  - `secretKeyEnc` → wraps `{ secretKey }` (the tenant's Moyasar API secret, used by `MoyasarApiClient` to charge).
  - `webhookSecretEnc` → wraps `{ webhookSecret }` (the tenant's HMAC-SHA256 webhook signing secret).
  - Both are written by `apps/backend/src/modules/finance/moyasar-config/upsert-moyasar-config.handler.ts` when the tenant configures Moyasar in their dashboard.
  - Both are decrypted by `MoyasarCredentialsService.decrypt` with `AAD = organizationId`. Decrypt failure → `BadRequestException('Tenant payment config is corrupt')`.

### Tenant resolution order (critical to understand)

The signature CANNOT be verified before the tenant is known, because the secret is per-tenant. The handler therefore opens system-context windows on `Invoice` and `OrganizationPaymentConfig` BEFORE verifying the signature. Stages, from `moyasar-webhook.handler.ts:60`:

1. Read `payload.metadata.invoiceId` from the (already JSON-parsed) body. Missing → `{ skipped: true }`.
2. **System-context** lookup: `Invoice.findFirst({ where: { id: invoiceId } })` → resolves `organizationId`.
3. **System-context** lookup: `OrganizationPaymentConfig.findUnique({ where: { organizationId } })` → fetches the encrypted blob.
4. Decrypt `cfg.webhookSecretEnc` with AAD = `invoice.organizationId`.
5. **Now** verify the HMAC: `HMAC-SHA256(rawBody, webhookSecret)` compared with `timingSafeEqual` against the `X-Moyasar-Signature` header.
6. Idempotency: skip if a `Payment` already exists for `gatewayRef = payload.id` with `status = COMPLETED`.
7. Anti-spoof: assert `payload.amount === Math.round(invoice.total * 100)` and `payload.currency === invoice.currency` (case-insensitive). Mismatch → `BadRequestException`.
8. Mutations under tenant CLS context.

The "DB before signature" inversion is mitigated by (a) the controller-level throttle, (b) returning the same generic responses on lookup failure to avoid acting as an oracle. See the comment block at `moyasar-webhook.handler.ts:32`.

### What it writes

All writes happen inside a CLS window with `tenant.organizationId = invoice.organizationId` and `membershipId = 'system'`.

| Status branch                                      | Table                                         | Mutation                                                                                                                                                          | Source                                                                          |
| -------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Always                                             | `Payment`                                     | UPSERT by `idempotencyKey='moyasar:<payload.id>'`. CREATE: `organizationId`, `invoiceId`, `amount`, `currency`, `method=ONLINE_CARD`, `status`, `gatewayRef`, etc. UPDATE: `status`, `processedAt`, `failureReason`. | `moyasar-webhook.handler.ts:152`                                                |
| `payload.status === 'paid'`                        | `Invoice`                                     | UPDATE → `status='PAID'`, `paidAt=now()`                                                                                                                          | `moyasar-webhook.handler.ts:171`                                                |
| `payload.status === 'paid'` (event consumer)       | `Booking` + `BookingStatusLog` (when present) | Booking → `status='CONFIRMED'`, `confirmedAt=now()`. Log row appended.                                                                                              | `apps/backend/src/modules/bookings/payment-completed-handler/payment-completed.handler.ts` |
| Anything else (`'failed'`, `'voided'`, `'refunded'`, etc. — see DTO enum) | `Payment`                                     | Same upsert with `status=FAILED` (the `'paid'` check is the sole gate; any other status is treated as failure for the local row)                                  | `moyasar-webhook.handler.ts:147`                                                |

Event emission happens **outside** the transaction (at-least-once via BullMQ; consumers are expected to be idempotent):

- `payment_paid` → `finance.payment.completed` (`PaymentCompletedEvent`).
- otherwise → `finance.payment.failed` (`PaymentFailedEvent`).

`RefundRequest` rows are NOT written by this webhook. Refunds are initiated by the admin API via `apps/backend/src/modules/finance/refund-payment/refund-payment.handler.ts`, which writes `RefundRequest` and transitions `Payment` to `REFUNDED` per the legal transitions in `apps/backend/src/modules/finance/payment-state-machine.ts` (`COMPLETED → REFUNDED` is the only allowed exit). The webhook does not currently process inbound `'refunded'` Moyasar events into `RefundRequest`.

### Common payloads

DTO enum from `moyasar-webhook.dto.ts:14`: `'paid' | 'failed' | 'refunded' | 'authorized' | 'captured' | 'voided'`. Of those, only `'paid'` flips the `Payment` to `COMPLETED` and the `Invoice` to `PAID`; everything else is recorded as `FAILED` on the local `Payment` row. There is no separate handler branch for `'refunded'` or `'voided'` in this webhook.

### Triage

> Symptom: payment captured in Moyasar (tenant's) dashboard but the booking is not confirmed and the invoice is still UNPAID.
> 1. `SELECT * FROM "Payment" WHERE "gatewayRef" = '<moyasar payment id>';` — if missing, the webhook never reached the handler past the signature stage. If present with `status='COMPLETED'`, the upsert ran but the booking-confirm event consumer failed.
> 2. `SELECT id, status, "paidAt" FROM "Invoice" WHERE id = '<invoiceId from metadata>';` — should be `PAID`.
> 3. `SELECT id, status, "confirmedAt" FROM "Booking" WHERE id = '<invoice.bookingId>';` — should be `CONFIRMED` if status was `PENDING` or `AWAITING_PAYMENT` at the time of the event. The consumer at `payment-completed.handler.ts:44` short-circuits on any other prior status.
> 4. If the `Payment` row is `COMPLETED` but the booking didn't update, BullMQ either lost the event or the consumer threw — check worker logs for `Failed to confirm booking ...`.

> Symptom: signature verification fails for ONE tenant only (`Invalid Moyasar webhook signature`).
> The tenant's `OrganizationPaymentConfig.webhookSecretEnc` is wrong or stale relative to what they configured in their Moyasar dashboard. Action: have the tenant re-enter their Moyasar webhook secret via their dashboard UI; this calls `UpsertMoyasarConfigHandler` which re-encrypts and writes the new blob. Verify by checking `lastVerifiedAt` is updated after their save.

> Symptom: signature verification fails for ALL tenants (`Invalid Moyasar webhook signature` across the board, OR `Tenant payment config is corrupt` for every request).
> `MOYASAR_TENANT_ENCRYPTION_KEY` may have been rotated, replaced, or set to a wrong value. The HKDF derivation depends on this master key — if it changes, every tenant's `webhookSecretEnc` becomes undecryptable. **This is a P0**: existing rows cannot be recovered without the previous master key. Recovery options:
> 1. Restore the previous `MOYASAR_TENANT_ENCRYPTION_KEY` value if known (deploy/rollback).
> 2. If the previous value is lost, every tenant must re-enter their Moyasar webhook secret. See `docs/operations/p2-credential-rekey-2026-05-09.md` for the migration runbook used during the legacy → HKDF cutover.
> 3. Cross-reference `docs/operations/2026-05-08-secret-rotation-runbook.md`.

> Symptom: `BadRequestException: Tenant payment config not found` for one tenant.
> The tenant has an `Invoice` row but no `OrganizationPaymentConfig`. They never completed Moyasar setup in their dashboard. The webhook is rejecting correctly; the upstream bug is that an invoice was issued without the tenant having a working payment config.

> Symptom: `BadRequestException: Payment amount does not match invoice total` or `... currency does not match invoice`.
> Stage 7 anti-spoof check rejected a payload whose amount/currency disagreed with the invoice. Either (a) the invoice was edited after the customer initiated payment (don't do that — issue a new invoice), or (b) someone is replaying / forging payloads. Inspect Moyasar dashboard for the actual charge amount; compare with `Invoice.total` and `Invoice.currency`.

> Symptom: handler returns `{ skipped: true }` and the webhook is never reflected in DB.
> Three branches return `{ skipped: true }`:
> - Missing `metadata.invoiceId` (`moyasar-webhook.handler.ts:64`) → the payment initiator forgot to attach metadata. Bug in whoever called Moyasar's `POST /v1/payments`.
> - Invoice not found (line 75) → metadata points at an invoice that doesn't exist in our DB. Either deleted or never written.
> - Already-completed payment for the same `gatewayRef` (line 117) → idempotent re-delivery. Expected.

> Symptom: throttle 429 on `/api/v1/public/payments/webhook`.
> The endpoint is throttled at 120 requests / 60s per upstream IP via `@Throttle({ default: { ttl: 60_000, limit: 120 } })`. Moyasar bursts during retry storms can plausibly exceed this from a single egress IP. If the burst is real Moyasar traffic, raise the limit on the controller and redeploy; if it's noise, leave it.

> Symptom: webhook hits but tenant resolution silently returns `{ skipped: true }` for many tenants.
> See `apps/backend/src/common/tenant/tenant-resolver.middleware.ts:32` for the SaaS-02e moyasar-webhook resolution comment. The middleware is bypassed via `SYSTEM_CONTEXT_CLS_KEY` for the lookup queries — if you see "systemContext bypass activated" log lines for `MoyasarWebhookHandler`, that is normal, not a security incident.

---

## Cross-flow operations

### Replay a missed webhook

- **Platform (Flow 1):** Use the Moyasar dashboard webhook redelivery feature for the relevant `payment_paid` / `payment_failed` event. Dedup is on `WebhookEvent (provider='MOYASAR_PLATFORM', eventId)` so re-delivering the same event id is safe — it returns `{ ok, deduped: true }` without mutating. There is no admin-API replay endpoint on the Deqah side; rely on Moyasar's redelivery.
- **Tenant (Flow 2):** Use the tenant's own Moyasar dashboard (each tenant has their own dashboard for their own account). Idempotency is on `Payment.idempotencyKey = 'moyasar:<payload.id>'`, so re-delivery of the same payment is safe and returns `{ skipped: true }` after the first success.

If Moyasar's dashboard cannot redeliver (event past retention), there is no first-class manual-replay endpoint. Manual recovery requires reconstructing the payment server-side: `verify-payment` for tenant flow (`apps/backend/src/modules/finance/verify-payment/verify-payment.handler.ts`) re-pulls payment state from Moyasar; for platform flow, the next `charge-due-subscriptions` cron tick or a direct `RecordSubscriptionPaymentHandler.execute` call by an engineer with DB access is the path.

### Rotate webhook secrets

- **Platform (Flow 1) — `MOYASAR_PLATFORM_WEBHOOK_SECRET`:**
  1. Generate a new secret in the Moyasar dashboard (Webhooks settings).
  2. Update the env var in the deploy target. The two values must be set atomically — for the rotation window, signature verification will fail for any in-flight webhook signed with the old secret.
  3. Redeploy / restart the backend (env is read at process boot via `ConfigService`).
  4. Trigger a low-value test charge through the cron or an upgrade flow to confirm round-trip.
- **Platform (Flow 1) — `MOYASAR_PLATFORM_SECRET_KEY`:**
  1. Same procedure on the Moyasar API key side. After rotation, the next call to `MoyasarSubscriptionClient.chargeWithToken` (or token / refund methods) uses the new key.
- **Tenant (Flow 2) — per-tenant webhook signing secret:**
  1. The tenant logs into their own Moyasar dashboard, rotates their webhook secret there.
  2. The tenant then re-enters the new secret in the Deqah app's "Payment settings" UI, which triggers `UpsertMoyasarConfigHandler` and writes a fresh `webhookSecretEnc` to `OrganizationPaymentConfig`.
  3. `lastVerifiedAt` and `lastVerifiedStatus` are reset to `null` on update — the next inbound webhook (or a manual "Test connection") re-verifies.
  4. There is NO platform-side bulk rotation for tenants; each tenant rotates independently.
- **Tenant (Flow 2) — `MOYASAR_TENANT_ENCRYPTION_KEY` (master, wraps all tenants):**
  1. **Do not rotate this in place** — every tenant's `secretKeyEnc` and `webhookSecretEnc` would become undecryptable.
  2. Use the rekey runbook: `docs/operations/p2-credential-rekey-2026-05-09.md`.
  3. Cross-reference: `docs/operations/2026-05-08-secret-rotation-runbook.md`.

### Verify a signature manually

- **Platform (Flow 1):**

  ```
  expected = HMAC_SHA256(rawBody, $MOYASAR_PLATFORM_WEBHOOK_SECRET)  // hex
  ok       = timingSafeEqual(expected, X-Moyasar-Signature header)
  ```

  Quick check from a shell with a captured raw body:

  ```bash
  printf '%s' "$RAW_BODY" \
    | openssl dgst -sha256 -hmac "$MOYASAR_PLATFORM_WEBHOOK_SECRET" -hex
  # Compare hex output with X-Moyasar-Signature header.
  ```

  Reference: `apps/backend/src/modules/finance/moyasar-api/moyasar-subscription.client.ts:148`.

- **Tenant (Flow 2):**

  ```
  cfg            = SELECT "webhookSecretEnc" FROM "OrganizationPaymentConfig" WHERE "organizationId" = ?;
  webhookSecret  = AES_256_GCM_decrypt(
                     ciphertext = base64decode(cfg.webhookSecretEnc),
                     key        = HKDF_SHA256(
                                    ikm  = $MOYASAR_TENANT_ENCRYPTION_KEY,
                                    salt = 'deqah-moyasar-creds-v1',
                                    info = organizationId,
                                    len  = 32
                                  ),
                     aad        = organizationId   // implicit GCM AAD via decrypt path
                   ).webhookSecret
  expected       = HMAC_SHA256(rawBody, webhookSecret)  // hex
  ok             = timingSafeEqual(expected, X-Moyasar-Signature header)
  ```

  References: `apps/backend/src/infrastructure/payments/moyasar-credentials.service.ts:57` (`decrypt`), `apps/backend/src/modules/finance/moyasar-webhook/moyasar-webhook.handler.ts:48` (`verifySignature`). The encrypted blob layout is `iv(12) || tag(16) || ciphertext`, base64-encoded.

  There is no off-the-shelf one-liner for tenant verification because the master key plus the org id are both required; in practice this check is only useful inside a Node REPL with `MoyasarCredentialsService` instantiated against the running env.

---

## Quick reference table

| Aspect              | Platform (Flow 1)                                                                                | Tenant (Flow 2)                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Endpoint            | `POST /api/v1/public/billing/webhooks/moyasar`                                                   | `POST /api/v1/public/payments/webhook`                                                                       |
| Controller          | `apps/backend/src/api/public/billing-webhook.controller.ts`                                      | `apps/backend/src/api/public/payment-webhook.controller.ts`                                                  |
| Handler module      | `apps/backend/src/modules/finance/moyasar-api/moyasar-subscription-webhook.handler.ts`           | `apps/backend/src/modules/finance/moyasar-webhook/`                                                          |
| Signature verifier  | `MoyasarSubscriptionClient.verifyWebhookSignature` (subscription.client.ts:148)                  | `MoyasarWebhookHandler.verifySignature` (handler.ts:48)                                                      |
| Throttle            | none on the controller                                                                           | 120 / 60s                                                                                                    |
| Auth                | none (public)                                                                                    | `@Public()` (no JWT)                                                                                         |
| Charges initiated by | Deqah (cron, upgrade, dunning, signup, saved cards)                                              | Tenant's own checkout / payment-init endpoints                                                               |
| Secret env var(s)   | `MOYASAR_PLATFORM_SECRET_KEY` + `MOYASAR_PLATFORM_WEBHOOK_SECRET`                                | `MOYASAR_TENANT_ENCRYPTION_KEY` (wraps per-tenant secrets)                                                   |
| Per-tenant config   | No                                                                                               | Yes — `OrganizationPaymentConfig` (`secretKeyEnc`, `webhookSecretEnc`)                                       |
| Encryption          | None at rest (env-var only)                                                                      | AES-256-GCM, key derived via HKDF-SHA256(masterKey, salt=`deqah-moyasar-creds-v1`, info=organizationId)      |
| Idempotency         | `WebhookEvent (provider='MOYASAR_PLATFORM', eventId)` unique                                     | `Payment.idempotencyKey = 'moyasar:<payload.id>'`; pre-check on `gatewayRef + status=COMPLETED`              |
| DB tables mutated   | `WebhookEvent`, `SubscriptionInvoice`, `Subscription`, `DunningLog`                              | `Payment`, `Invoice`, `Booking` (via event consumer), `BookingStatusLog`                                     |
| State machine       | `apps/backend/src/modules/platform/billing/subscription-state-machine.ts` (TRIALING/ACTIVE/PAST_DUE/SUSPENDED/CANCELED) | `apps/backend/src/modules/finance/payment-state-machine.ts` (PENDING/PENDING_VERIFICATION/COMPLETED/FAILED/REFUNDED) |
| Tenant resolution   | Looked up from `SubscriptionInvoice → Subscription.organizationId` AFTER signature verification | Looked up from `Invoice.organizationId` BEFORE signature verification (signature secret is per-tenant)       |
| Outbound events     | None directly (handlers update DB and email)                                                     | `finance.payment.completed` / `finance.payment.failed` (BullMQ)                                              |

---

## Related

- `docs/operations/moyasar-coordination.md` — DESIGN spec for all Moyasar flows (this runbook is the operator cheat-sheet derived from it).
- `docs/operations/2026-05-08-secret-rotation-runbook.md` — secret rotation procedure.
- `docs/operations/p2-credential-rekey-2026-05-09.md` — `MOYASAR_TENANT_ENCRYPTION_KEY` rekey migration.
- `docs/operations/rollback-runbook.md`
- `docs/operations/disaster-recovery.md`

---

## Known unknowns

Honest list of things this runbook does not cover, because they are not pinned down by the code yet:

- **Inbound `'refunded'` events on Flow 2.** The DTO accepts the value but the handler has no branch that creates/updates a `RefundRequest` row from a refund webhook — refunds are written only by the admin-initiated `RefundPaymentHandler`. Confirm with finance whether Moyasar refunds initiated outside our admin UI (e.g. via the tenant's Moyasar dashboard directly) currently round-trip into our DB. Best evidence today says no.
- **Per-tenant webhook URL configuration.** All tenants share the single URL `/api/v1/public/payments/webhook` and route by `metadata.invoiceId`. There is no documented procedure for what the tenant should literally paste into their own Moyasar dashboard "Webhook URL" field. (Empirically: the same shared URL.)
- **`Authorized` / `captured` / `voided` payloads.** DTO accepts these statuses, but the handler only treats `'paid'` as success — every other status flips the local Payment to FAILED. If Moyasar's hosted checkout uses `authorized → captured` two-step flows for any tenant, that tenant's payments will be recorded as FAILED on the authorize step. No incident has been reported, but the code path is fragile.
- **Cross-region / multi-MID setups on the platform side.** `MOYASAR_PLATFORM_SECRET_KEY` is a single env var; if Deqah ever splits platform billing across multiple Moyasar merchant accounts (e.g. one per region), this design will need to grow per-region resolution. Today: single account, single key.
- **Webhook delivery retention window.** This doc says "use Moyasar dashboard redelivery" but does not pin Moyasar's actual retention policy (24h? 7d?). Verify against Moyasar docs at incident time.
- **Throttle interaction with bursts.** The 120/60s throttle on Flow 2 is per upstream IP; the actual blast radius of a Moyasar retry storm depends on Moyasar's egress topology and is not characterized here.
