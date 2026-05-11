-- Migration: outbox_failure_tracking
--
-- Adds failure-tracking columns to OutboxEvent so the outbox publisher
-- cron can detect stuck events and stop retrying them after max attempts.
--
-- Columns added:
--   attemptCount  — incremented on every failed publish attempt
--   failedAt      — set (along with failureReason) when attemptCount reaches 10
--   failureReason — last error message (truncated to 500 chars)

ALTER TABLE "OutboxEvent"
  ADD COLUMN IF NOT EXISTS "attemptCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedAt"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

-- Partial index: only non-terminal rows need to be scanned by the cron.
-- Rows where failedAt IS NOT NULL are permanently failed and excluded.
CREATE INDEX IF NOT EXISTS "OutboxEvent_failedAt_idx"
  ON "OutboxEvent" ("failedAt") WHERE "failedAt" IS NULL;
