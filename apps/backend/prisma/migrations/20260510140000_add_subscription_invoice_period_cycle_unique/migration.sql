-- Pre-flight: verify no duplicates before adding constraint:
-- SELECT "subscriptionId", "periodStart", "billingCycle", COUNT(*)
-- FROM "SubscriptionInvoice"
-- GROUP BY 1,2,3 HAVING COUNT(*) > 1;
-- Expected: 0 rows

-- CR-7 Phase 3: prevent duplicate SubscriptionInvoice for the same billing period.
-- Guards against double-charge bugs where ChargeDueSubscriptionsCron fires twice
-- for the same (subscription, periodStart, billingCycle) combination.
CREATE UNIQUE INDEX "SubscriptionInvoice_sub_period_cycle_uq"
  ON "SubscriptionInvoice" ("subscriptionId", "periodStart", "billingCycle");
