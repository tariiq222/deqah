---
"backend": patch
---

`refund-payment.handler` now calls Moyasar's refund API BEFORE writing the local `Refund` row, so a Moyasar failure no longer leaves the database recording a refund that never happened (PR #153).
