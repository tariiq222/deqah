# OutboxEvent Publisher — Operator Runbook

> **Status:** active
> **Last reviewed:** 2026-05-11
> **Source of truth:** `apps/backend/src/modules/ops/cron-tasks/outbox-publisher.cron.ts`
> **Related migrations:** `20260510130000_outbox_event`, `20260511030000_fix_outbox_payment_booking_schema`

---

## 1. What it is

The OutboxEvent table implements the **transactional outbox pattern** for inter-context domain events. When a domain handler (currently only `CreateBookingHandler`) commits a write, it inserts a row into `OutboxEvent` **inside the same Postgres transaction**. A background cron, `OutboxPublisherCron`, then claims pending rows in batches and forwards each to `EventBusService`, which enqueues them on the BullMQ `domain-events` queue for cross-context handlers.

Why: a direct `eventBus.publish()` after `commit()` can be lost if the process crashes between the two. The outbox guarantees **at-least-once delivery** without dual-write to a queue inside the transaction. If the publish or the post-publish UPDATE fails, the row stays `PENDING` and the next tick retries it.

---

## 2. Topology

```
+-------------------------------+
| CreateBookingHandler          |   apps/backend/src/modules/bookings/
|   tx.outboxEvent.create({...})|     create-booking/create-booking.handler.ts:325
+---------------+---------------+
                |  (same Prisma transaction, Serializable isolation)
                v
        +-------+--------+
        |  OutboxEvent   |   Postgres table (see Section 3)
        |  status=PENDING|
        +-------+--------+
                |
                |  every 1 min, batch of 50, FOR UPDATE SKIP LOCKED
                v
+-------------------------------+
| OutboxPublisherCron           |   apps/backend/src/modules/ops/cron-tasks/
|   .execute()                  |     outbox-publisher.cron.ts
|   - withCronLeader (pg lock)  |   apps/backend/src/common/helpers/cron-leader.helper.ts
|   - SUPER_ADMIN_CONTEXT CLS   |
+---------------+---------------+
                |  eventBus.publish(eventType, payload)
                v
+-------------------------------+
| EventBusService               |   apps/backend/src/infrastructure/events/
|   queue.add(eventName, env)   |     event-bus.service.ts
+---------------+---------------+
                |
                v
       +--------+---------+
       | BullMQ queue:    |   Redis-backed
       | "domain-events"  |
       +--------+---------+
                |
                v   on success, cron stamps PUBLISHED + publishedAt
+-------------------------------+
| Subscribed handlers           |   registered via EventBusService.subscribe()
|   (per-context dispatch)      |
+-------------------------------+
```

The outbox cron job itself is enqueued as a BullMQ repeating job on the **`ops-cron`** queue (`apps/backend/src/modules/ops/cron-tasks/cron-tasks.service.ts:24,103`), separate from `domain-events`.

---

## 3. Schema

Defined in `apps/backend/prisma/schema/ops.prisma:92-104`. Final shape after both migrations:

| Column        | Type                  | Null | Default              | Indexed?                                       | Purpose |
|---------------|-----------------------|------|----------------------|------------------------------------------------|---------|
| `id`          | `UUID`                | NO   | `gen_random_uuid()`  | PK                                             | Row identity |
| `aggregateId` | `TEXT`                | NO   | —                    | no                                             | Domain aggregate that produced the event (e.g. `bookingId`) |
| `eventType`   | `TEXT`                | NO   | —                    | no                                             | Routing key passed to `EventBusService.publish()` (e.g. `bookings.booking.created`) |
| `payload`     | `JSONB`               | NO   | —                    | no                                             | Full `DomainEventEnvelope` |
| `status`      | `TEXT`                | NO   | `'PENDING'`          | composite `(status, lockedUntil)`              | `PENDING` or `PUBLISHED`. **`FAILED` is documented but never written** — see Section 12 |
| `lockedUntil` | `TIMESTAMPTZ`         | YES  | —                    | composite `(status, lockedUntil)`              | Publisher writes `now() + 30s` while a row is being processed; cleared back to `NULL` on success |
| `publishedAt` | `TIMESTAMPTZ`         | YES  | —                    | partial `(publishedAt) WHERE NULL`             | Set to `now()` when the event is successfully forwarded to `EventBusService` |
| `createdAt`   | `TIMESTAMPTZ`         | YES  | `now()`              | no (used in `ORDER BY` only)                   | Insert time — used to publish FIFO |

Indexes (verbatim from the migrations):

- `OutboxEvent_publishedAt_idx` — partial index `WHERE "publishedAt" IS NULL` (created by `20260510130000_outbox_event/migration.sql:15`).
- `OutboxEvent_status_locked_idx` — composite `(status, lockedUntil)` (created by `20260511030000_fix_outbox_payment_booking_schema/migration.sql:17-18`).

The publisher query uses `WHERE status = 'PENDING' AND ("lockedUntil" IS NULL OR "lockedUntil" < now())`, which is served by the second index.

---

## 4. Producers (who writes to OutboxEvent)

A repo-wide grep for `outboxEvent.create` and `tx.outboxEvent` in `apps/backend/src/` returns **exactly one production producer**:

| Producer | File | Event type | When |
|----------|------|------------|------|
| `CreateBookingHandler` | `apps/backend/src/modules/bookings/create-booking/create-booking.handler.ts:325` | `BookingCreatedEvent.eventName` (`bookings.booking.created`) | Inside the Serializable transaction that creates a `Booking`, after the post-create plan-limit recheck |

Note: the second migration is named `fix_outbox_payment_booking_schema` because it bundles unrelated fixes for `Payment.gatewayRef` (UNIQUE) and three `Booking` composite indexes alongside the OutboxEvent column additions. **No payment handler currently writes to `OutboxEvent`** — the migration name is misleading. (See Section 12.)

---

## 5. Consumer / publisher cron

File: `apps/backend/src/modules/ops/cron-tasks/outbox-publisher.cron.ts`.

- **Schedule:** `*/1 * * * *` — every minute. Registered in `apps/backend/src/modules/ops/cron-tasks/cron-tasks.service.ts:103` on the `ops-cron` BullMQ queue. The inline comment in that file claims the real tick is "every 5 s via worker loop", but **no internal loop exists in `outbox-publisher.cron.ts`**; one batch is processed per cron invocation. The cron header comment also says "every 5 s" — both are stale. **Treat the publisher as a once-per-minute job.**
- **Batch size:** `BATCH_SIZE = 50` (constant at `outbox-publisher.cron.ts:10`).
- **Order:** `ORDER BY "createdAt" ASC` — oldest first, FIFO.
- **Concurrency safety:** wrapped in `withCronLeader(prisma, 'outbox-publisher', …)` (`apps/backend/src/common/helpers/cron-leader.helper.ts`), which uses `pg_try_advisory_lock(hashtext('outbox-publisher'))`. Only one backend instance runs the body per tick. The SQL also uses `FOR UPDATE SKIP LOCKED` as belt-and-braces.
- **Per-tick algorithm (`publishPending`, lines 43–94):**
  1. Acquire pg advisory lock; bail silently if another instance holds it.
  2. `SELECT id, eventType, payload FROM "OutboxEvent" WHERE status = 'PENDING' AND (lockedUntil IS NULL OR lockedUntil < now()) ORDER BY createdAt ASC LIMIT 50 FOR UPDATE SKIP LOCKED`.
  3. If empty, return.
  4. `UPDATE "OutboxEvent" SET lockedUntil = now() + 30s WHERE id = ANY(<batch>)`.
  5. For each row, call `eventBus.publish(eventType, payload)`. Failures are logged (`Failed to publish outbox event <id> (<eventType>)`) and the row is **skipped** — no status change.
  6. For successfully published rows, `outboxEvent.updateMany({ data: { status: 'PUBLISHED', publishedAt: now(), lockedUntil: null } })`.
  7. Log `Outbox: published N events` (only if N > 0).
- **Tenant context:** runs inside `cls.run(...)` with `SUPER_ADMIN_CONTEXT_CLS_KEY = true`, accessing rows via `prisma.$allTenants` (the OutboxEvent table is platform-level — no `organizationId`).
- **BullMQ retry policy for the cron job itself:** `attempts: 3`, exponential backoff 30 s (`cron-tasks.service.ts:114-115`). Exhausted runs go to DLQ via `worker.on('failed', …)` at `cron-tasks.service.ts:204-211`.
- **No `*_CRON_ENABLED` env gate** — the publisher runs unconditionally whenever the backend is up. Compare with billing crons that gate on `BILLING_CRON_ENABLED` (`apps/backend/src/config/env.validation.ts:198`).

---

## 6. Healthy state — what "normal" looks like

- **Pending row count**: typically `0`. Brief spikes during booking bursts are normal; the next tick (≤ 60 s) drains up to 50.
- **`lockedUntil`**: should be `NULL` for almost every row. A non-null `lockedUntil` more than ~60 s in the past indicates a row that the publisher claimed but failed to publish (and lost the lock without updating to `PUBLISHED`).
- **Publisher log lines**: when there is traffic, you should see `Outbox: published N events` from `OutboxPublisherCron` and `Cron outbox-publisher ok in <ms>ms` from `CronTasksService` (`cron-tasks.service.ts:194`) every minute.

### Quick health checks

```sql
-- Status distribution (run on backend Postgres)
SELECT status, COUNT(*) FROM "OutboxEvent" GROUP BY status;

-- Pending backlog age
SELECT
  COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_total,
  COUNT(*) FILTER (WHERE status = 'PENDING' AND "createdAt" < now() - interval '5 minutes') AS pending_over_5min,
  COUNT(*) FILTER (WHERE status = 'PENDING' AND "lockedUntil" IS NOT NULL AND "lockedUntil" < now()) AS pending_lock_expired
FROM "OutboxEvent";

-- Oldest pending row
SELECT id, "eventType", "createdAt", "lockedUntil"
FROM "OutboxEvent"
WHERE status = 'PENDING'
ORDER BY "createdAt" ASC
LIMIT 5;
```

### System-health endpoint

`GET /api/v1/admin/system-health` (handler at `apps/backend/src/modules/platform/system-health/get-system-health/get-system-health.handler.ts`) reports `postgres`, `redis`, `bullmq`, `minio`, `moyasar`, `resend`. **It does NOT surface OutboxEvent backlog.** Use the SQL queries above for outbox-specific health.

### CronHeartbeat

The `CronHeartbeat` table (`apps/backend/prisma/schema/ops.prisma:59-63`) is intended for "watchdog cron to alert on missed heartbeats", but **`OutboxPublisherCron` does not currently write to it** (the heartbeat update is not present in `outbox-publisher.cron.ts`). Do not rely on `CronHeartbeat` for outbox liveness. (See Section 12.)

---

## 7. Alarm signals

Concrete thresholds, all derived from the code in Section 5:

| Signal | Threshold | What it means |
|--------|-----------|---------------|
| Pending backlog | `> 200` rows for `> 5` minutes | Cron isn't keeping up (batch is 50/minute → steady-state cap ≈ 50/min). Investigate cron liveness. |
| Pending backlog | `> 1000` rows or growing monotonically | Cron is stalled or BullMQ queue is failing. Page on-call. |
| Oldest pending `createdAt` | `> 10` minutes | At least 10 missed ticks. Cron is down or advisory lock is stuck. |
| Rows with `lockedUntil < now() - interval '5 minutes'` and `status = 'PENDING'` | `> 0` | Publisher claimed rows but the post-publish UPDATE never landed (process crash between `eventBus.publish` and `updateMany`). They will retry on the next tick — if persistent, suspect a poison message. |
| Backend log: `Failed to publish outbox event <id>` | repeated for the **same `id`** every minute | Same row failing repeatedly — the eventBus / Redis is down, or the payload triggers a publish-side error. There is no max-attempts cap; the row will retry forever. |
| BullMQ `domain-events` queue depth | growing without drain | Subscribers (handlers registered via `eventBus.subscribe`) are failing or absent. Outbox is doing its job; the downstream queue is stuck. |
| `status = 'FAILED'` | any | Should be impossible — no code path writes `FAILED` (see Section 12). If observed, someone has run manual SQL. |

---

## 8. Triage playbook

### Alarm: "Pending rows backlog"

1. **Confirm backend is running.** `curl https://api.deqah.net/health` (per `docs/operations/rollback-runbook.md`). If 5xx → follow the rollback runbook first; outbox will drain when backend is back.
2. **Check system-health for Postgres + Redis + BullMQ.**
   ```bash
   curl -H 'Authorization: Bearer <SUPER_ADMIN_JWT>' https://api.deqah.net/api/v1/admin/system-health
   ```
   If any of `postgres`, `redis`, `bullmq` reports `down` or `degraded`, fix that first.
3. **Check the cron leader lock.** Run on Postgres:
   ```sql
   SELECT * FROM pg_locks WHERE locktype = 'advisory';
   ```
   A stuck advisory lock (held by a dead session) blocks every tick. Identify the holding `pid`:
   ```sql
   SELECT pid, state, query_start, query
   FROM pg_stat_activity
   WHERE pid IN (SELECT pid FROM pg_locks WHERE locktype = 'advisory');
   ```
   Terminate a stale holder with `SELECT pg_terminate_backend(<pid>);` only if it is clearly idle/dead (no active query, `state = 'idle'` for minutes).
4. **Check backend logs for the cron tick.** Look for `Cron outbox-publisher ok in …` once per minute and any `Failed to publish outbox event …` lines (logger source: `OutboxPublisherCron`, see `outbox-publisher.cron.ts:80-83`).
5. **Check Redis / BullMQ.** The cron jobs themselves live on the `ops-cron` queue:
   ```bash
   # Inside the backend container or via redis-cli
   redis-cli KEYS 'bull:ops-cron:*' | head
   redis-cli LLEN bull:ops-cron:wait
   redis-cli ZCARD bull:ops-cron:delayed
   ```
   The downstream queue:
   ```bash
   redis-cli LLEN bull:domain-events:wait
   redis-cli ZCARD bull:domain-events:delayed
   redis-cli LLEN bull:domain-events:failed
   ```
   No custom prefix is configured (`apps/backend/src/infrastructure/queue/bull-mq.service.ts:115-124` does not set `prefix`), so BullMQ default `bull:<queue>:…` keys apply.
6. **If the cron is stuck and the lock is held by a live backend that's not progressing**, restart that backend instance (Dokploy → restart service). Lock is released on session end.

### Alarm: "Pending rows with expired `lockedUntil`"

1. These will be picked up automatically on the next tick (the publisher's WHERE clause includes `OR "lockedUntil" < now()`).
2. If the same row keeps re-appearing, fetch its payload and look for a parse / handler error:
   ```sql
   SELECT id, "eventType", "createdAt", "lockedUntil", payload
   FROM "OutboxEvent"
   WHERE status = 'PENDING' AND id = '<row-id>';
   ```
3. Check backend logs for `Failed to publish outbox event <row-id>` and the stack trace.
4. **There is no automatic poison-message handling.** A persistently failing row will block nothing (FOR UPDATE SKIP LOCKED + ORDER BY createdAt means others past it are still picked up — but it consumes one of the 50 batch slots forever, so a large backlog of poison messages can starve healthy traffic). Mitigation: see Section 9 (manual `PUBLISHED` mark) once the underlying bug is fixed or the event is judged unrecoverable.

### Alarm: "domain-events queue growing"

This is **not an outbox problem** — the publisher is doing its job. Investigate the subscribed handlers:

1. `redis-cli LLEN bull:domain-events:failed` → list failing job names.
2. Check backend logs from `EventBusService` (`apps/backend/src/infrastructure/events/event-bus.service.ts:102-131`) and the specific handler.
3. Once subscribers recover, BullMQ will retry per the publish options (`removeOnComplete: { age: 3600, count: 1000 }`, `removeOnFail: { age: 24*3600 }` from `event-bus.service.ts:62-63`).

---

## 9. Manual operations

### Manually flush pending rows

**Not implemented as an admin endpoint.** No controller in `apps/backend/src/api/admin/` exposes outbox operations (verified via `ls apps/backend/src/api/admin/` and grep for `outbox` under `apps/backend/src/api`).

Options, in increasing risk:

1. **Wait for next tick** (≤ 60 s). This is almost always the right answer.
2. **Restart the backend** to interrupt a stuck cron run. The new instance picks up at the next BullMQ tick. Do this from Dokploy. Per `docs/operations/rollback-runbook.md`, this is non-destructive.
3. **Bypass the cron and publish directly** (last resort, requires DB shell access). There is no SQL-level way to "force publish" — publishing requires the BullMQ enqueue. The only safe knob from SQL is to **clear a stuck `lockedUntil`** so the next tick re-claims the row:
   ```sql
   -- Free up rows whose lock should have expired but haven't been retried.
   UPDATE "OutboxEvent"
   SET "lockedUntil" = NULL
   WHERE status = 'PENDING'
     AND "lockedUntil" IS NOT NULL
     AND "lockedUntil" < now() - interval '5 minutes';
   ```

### Replay a specific event

**Not implemented.** Once `status = 'PUBLISHED'`, the row is no longer eligible (publisher's WHERE clause filters on `status = 'PENDING'`).

Manual replay procedure (DB-shell, requires sign-off — re-publishing causes downstream handlers to run again, which they may not be idempotent for):

```sql
-- Re-arm a single row for republish
UPDATE "OutboxEvent"
SET status = 'PENDING', "publishedAt" = NULL, "lockedUntil" = NULL
WHERE id = '<row-id>';
```

The next tick will pick it up. Verify subscribers are idempotent for the relevant `eventType` first.

### Mark a poison row as published (skip)

When a row is unrecoverable (malformed payload, deprecated event type, etc.) and you want the publisher to stop attempting it:

```sql
UPDATE "OutboxEvent"
SET status = 'PUBLISHED', "publishedAt" = now(), "lockedUntil" = NULL
WHERE id = '<row-id>';
```

This breaks at-least-once for that single row. Document the decision in `ActivityLog` or an incident ticket.

### Purge old PUBLISHED rows (housekeeping)

**Not implemented in code.** No retention cron, no TTL. `PUBLISHED` rows accumulate indefinitely.

Manual purge (run during low-traffic window):

```sql
-- Delete events published more than 30 days ago
DELETE FROM "OutboxEvent"
WHERE status = 'PUBLISHED'
  AND "publishedAt" < now() - interval '30 days';
```

Add to a periodic maintenance task if table size becomes a concern. (See Section 12.)

---

## 10. Configuration

- **No env var gates the outbox publisher.** A grep for `OUTBOX` in `apps/backend/` finds no env keys; `apps/backend/src/config/env.validation.ts` has no outbox entries. The cron runs whenever the backend starts and `CronTasksService.onModuleInit` registers it.
- **Batch size**: hard-coded constant `BATCH_SIZE = 50` at `outbox-publisher.cron.ts:10`. Changing requires a code deploy.
- **Lock TTL**: hard-coded `30_000` ms at `outbox-publisher.cron.ts:48`.
- **Cron schedule**: hard-coded `'*/1 * * * *'` at `cron-tasks.service.ts:103`.
- **BullMQ retry for the cron job**: `attempts: 3`, exponential 30 s backoff (`cron-tasks.service.ts:114-115`).
- **Redis connection** for the `ops-cron` queue: built from `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` (`bull-mq.service.ts:115-124`). No queue prefix override.

---

## 11. Related runbooks

- `docs/operations/rollback-runbook.md` — when to roll back vs. fix forward; covers backend restart procedure.
- `docs/operations/disaster-recovery.md` — Postgres restore (recovers OutboxEvent rows along with everything else; at-least-once is preserved as long as committed rows survive the restore).
- `docs/operations/deployment-guide.md` — backend deploy steps; the publisher resumes automatically after a restart.
- `docs/operations/docker-architecture.md` — service topology including Redis / Postgres / backend containers.
- `docs/operations/moyasar-coordination.md` — payment-side incident playbook (currently unrelated to outbox; payment handlers do not write OutboxEvent).

---

## 12. Known unknowns / open questions

Recorded honestly during the read of the source. Each item is a real ambiguity that an operator may hit at 3am — verify before acting on assumptions.

1. **Stale "every 5 s" comments.** Both `outbox-publisher.cron.ts:3,15` and the migration header at `20260510130000_outbox_event/migration.sql:3` claim the cron runs every 5 seconds, but the actual BullMQ schedule at `cron-tasks.service.ts:103` is `*/1 * * * *` (every minute). The trailing comment on that line acknowledges the discrepancy ("BullMQ min granularity; real tick is every 5s via worker loop") but **no internal loop exists** in `outbox-publisher.cron.ts` — one batch per invocation. Real cadence is **once per minute**.
2. **`FAILED` status is never written.** The schema documents `status: PENDING | PUBLISHED | FAILED` (`ops.prisma:97`) but no code path sets `FAILED`. Failed publishes leave the row as `PENDING` with a populated `lockedUntil` and retry forever (no max-attempts column). If you want failed-row alerting based on `status = 'FAILED'`, that code does not yet exist.
3. **No retry counter / no DLQ for poison messages.** A row whose `eventBus.publish` fails on every attempt will be retried every minute indefinitely. There is no `attempts` column on `OutboxEvent` and no automatic move to a dead-letter table.
4. **`OutboxPublisherCron` does not write `CronHeartbeat`.** Despite `CronHeartbeat` existing for "watchdog cron to alert on missed heartbeats" (`ops.prisma:55-63`), the outbox cron does not call into it. Use the SQL backlog queries in Section 6 instead.
5. **Two indexes that overlap.** `OutboxEvent_publishedAt_idx` (partial, `WHERE publishedAt IS NULL`) was created in the first migration to support a `WHERE publishedAt IS NULL` query that the **current** publisher no longer issues — it now queries `WHERE status = 'PENDING' AND (lockedUntil IS NULL OR lockedUntil < now())`, served by `OutboxEvent_status_locked_idx`. The partial index appears to be dead weight; consider dropping in a future migration after confirming nothing else uses it.
6. **Migration name vs. content mismatch.** `20260511030000_fix_outbox_payment_booking_schema` suggests a payment producer was added, but no payment handler writes `OutboxEvent` (verified by grep across `apps/backend/src/modules/finance/`). The migration only adds columns/indexes to existing tables.
7. **No housekeeping for `PUBLISHED` rows.** Table will grow unbounded over time. There is no retention cron in `apps/backend/src/modules/ops/cron-tasks/`. Plan a periodic `DELETE` (Section 9) or build a retention cron before the table becomes a vacuum problem.
8. **Single producer.** Only `CreateBookingHandler` writes to OutboxEvent today. If you find rows with `eventType` other than `bookings.booking.created` in production, a new producer was added without updating this runbook — re-grep `apps/backend/src` for `outboxEvent.create` and update Section 4.
