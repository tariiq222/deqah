-- Add bookingNumber as nullable first
ALTER TABLE "Booking" ADD COLUMN "bookingNumber" INTEGER;

-- Backfill: assign sequential numbers per organization ordered by createdAt, then id
UPDATE "Booking" b
SET "bookingNumber" = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "organizationId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "Booking"
) sub
WHERE b.id = sub.id;

-- Now make it NOT NULL
ALTER TABLE "Booking" ALTER COLUMN "bookingNumber" SET NOT NULL;

-- Unique constraint per org
CREATE UNIQUE INDEX "booking_org_number" ON "Booking"("organizationId", "bookingNumber");
