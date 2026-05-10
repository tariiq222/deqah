-- Migration: fix_outbox_payment_booking_schema
--
-- Adds columns and indexes that exist in the Prisma schema but were missing
-- from the migration history after the initial OutboxEvent table was created.
--
-- Covers:
--   1. OutboxEvent: add status + lockedUntil columns and composite index
--   2. Payment: add UNIQUE constraint on gatewayRef
--   3. Booking: add 3 composite org-scoped indexes for query performance

-- ─── 1. OutboxEvent ───────────────────────────────────────────────────────────

ALTER TABLE "OutboxEvent"
  ADD COLUMN IF NOT EXISTS "status"      TEXT        NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "OutboxEvent_status_locked_idx"
  ON "OutboxEvent" ("status", "lockedUntil");

-- ─── 2. Payment ───────────────────────────────────────────────────────────────

-- Drop the non-unique index first to avoid duplicate index name conflict
DROP INDEX IF EXISTS "Payment_gatewayRef_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_gatewayRef_key"
  ON "Payment" ("gatewayRef");

-- ─── 3. Booking ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "Booking_organizationId_scheduledAt_idx"
  ON "Booking" ("organizationId", "scheduledAt");

CREATE INDEX IF NOT EXISTS "Booking_organizationId_status_idx"
  ON "Booking" ("organizationId", "status");

CREATE INDEX IF NOT EXISTS "Booking_organizationId_clientId_idx"
  ON "Booking" ("organizationId", "clientId");
