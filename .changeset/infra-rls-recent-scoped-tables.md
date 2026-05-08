---
"backend": patch
---

Adds Postgres RLS policies for scoped tables introduced after the original RLS migration cluster (`20260508062116_rls_for_recent_scoped_tables`). Closes the gap where new tenant-scoped models were created without enabling row-level security (PR #159).
