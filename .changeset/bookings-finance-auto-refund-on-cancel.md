---
"backend": patch
---

Cancelling a paid booking now emits `BookingCancelledEvent` which is handled by `OnBookingCancelledHandler` in the finance module to issue an automatic refund through Moyasar. Closes the gap where clients had to chase clinics manually after cancellation (PR #168).
