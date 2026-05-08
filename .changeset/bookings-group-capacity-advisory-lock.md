---
"backend": patch
---

Wraps the group-booking capacity check in `create-booking.handler` with a Postgres advisory lock keyed on the slot id, eliminating the race where two concurrent requests could both pass the capacity check and overbook a group session (PR #160).
