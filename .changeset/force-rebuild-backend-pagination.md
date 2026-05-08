---
"backend": patch
---

Force rebuild backend image — earlier promote skipped backend build due to a
false-positive in the version-existence filter, leaving production on the
pre-pagination shape of `GET /admin/plans` while the admin frontend was
already updated to expect `{ items, meta }`. Filter is removed in the same
PR; this bump forces v2.1.9 to actually build and deploy.
