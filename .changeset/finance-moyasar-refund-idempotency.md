---
"backend": patch
---

Adds an `Idempotency-Key` header to `MoyasarApiClient.createRefund` so retries (CI redrives, BullMQ retries, manual replays) cannot double-refund the same payment. The key is derived from `paymentId + refundId` and propagated through `refund-payment.handler` and `approve-refund.handler` (PR #166).
