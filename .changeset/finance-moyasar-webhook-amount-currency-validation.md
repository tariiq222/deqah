---
"backend": patch
---

`MoyasarWebhookHandler` now validates the incoming webhook's `amount` and `currency` against the original `Payment` row before marking it completed. Stops a forged or replayed webhook from completing a payment for the wrong amount (PR #152).
