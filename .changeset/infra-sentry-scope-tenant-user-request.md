---
"backend": patch
---

`HttpExceptionFilter` now attaches `tenant`, `user`, and `requestId` to every Sentry/GlitchTip scope before capturing exceptions, so production errors are no longer reported without the org/user context required to triage them (PR #158).
