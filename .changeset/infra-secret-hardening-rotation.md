---
"backend": patch
---

Tightens `env.validation` for production secrets (rejects placeholder/short values), masks secrets out of `.dockerignore`-bound build context, and logs masked-secret startup banner from `main.ts`. Pairs with the new rotation runbook (PR #154).
