---
"backend": patch
---

All user mutation handlers (`assign-role`, `remove-role`, `deactivate-user`, `delete-user`) now verify the caller has an active `Membership` in the target user's organization before acting. Blocks a cross-tenant privilege-escalation path where a user with admin role in org A could mutate users in org B (PR #165).
