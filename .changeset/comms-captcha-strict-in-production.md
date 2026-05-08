---
"backend": patch
---

`env.validation` now rejects `CAPTCHA_PROVIDER=noop` when `NODE_ENV=production`, and `captcha.verifier` defaults to fail-closed instead of fail-open. Prevents shipping a tenant build with CAPTCHA silently disabled (PR #156).
