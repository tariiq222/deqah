-- TAR-86 pre-deploy guard for 20260511030000_fix_outbox_payment_booking_schema.
--
-- Purpose:
--   Pre-create the Booking and Payment indexes concurrently before running
--   `prisma migrate deploy` on a live database. The existing migration uses
--   non-concurrent CREATE INDEX statements, but it also uses IF NOT EXISTS.
--   Creating the same index names here makes those migration statements skip.
--
-- Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/predeploy-20260511030000-concurrent-indexes.sql
--
-- Do not wrap this file in BEGIN/COMMIT. PostgreSQL rejects CREATE INDEX
-- CONCURRENTLY inside an explicit transaction block.

SET lock_timeout = '5s';
SET statement_timeout = '30min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Payment"
    WHERE "gatewayRef" IS NOT NULL
    GROUP BY "gatewayRef"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create "Payment_gatewayRef_key": duplicate non-null Payment.gatewayRef values exist';
  END IF;
END
$$;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Payment_gatewayRef_key"
  ON "Payment" ("gatewayRef");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_organizationId_scheduledAt_idx"
  ON "Booking" ("organizationId", "scheduledAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_organizationId_status_idx"
  ON "Booking" ("organizationId", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_organizationId_clientId_idx"
  ON "Booking" ("organizationId", "clientId");

WITH expected(index_name) AS (
  VALUES
    ('"Payment_gatewayRef_key"'),
    ('"Booking_organizationId_scheduledAt_idx"'),
    ('"Booking_organizationId_status_idx"'),
    ('"Booking_organizationId_clientId_idx"')
)
SELECT
  expected.index_name,
  pg_index.indisvalid,
  pg_index.indisready
FROM expected
LEFT JOIN pg_class ON pg_class.oid = to_regclass(expected.index_name)
LEFT JOIN pg_index ON pg_index.indexrelid = pg_class.oid
ORDER BY expected.index_name;
