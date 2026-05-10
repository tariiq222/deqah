-- CR-5: OutboxEvent table for reliable event delivery.
-- Events are written here inside the booking transaction;
-- OutboxPublisherCron picks them up every 5 s and forwards to EventBusService.
-- publishedAt IS NULL means not yet published (partial index for fast polling).

CREATE TABLE "OutboxEvent" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  payload JSONB NOT NULL,
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX "OutboxEvent_publishedAt_idx" ON "OutboxEvent" ("publishedAt") WHERE "publishedAt" IS NULL;
