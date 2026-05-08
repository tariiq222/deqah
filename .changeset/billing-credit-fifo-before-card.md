---
"backend": patch
---

`ChargeDueSubscriptionsCron` now consumes available `BillingCredit` rows in FIFO order before invoking Moyasar to charge the saved card. Tenants with platform-granted credit are no longer double-charged (PR #155).
