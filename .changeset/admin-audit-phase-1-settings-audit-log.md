---
"@deqah/backend": patch
---

Closes the audit-log gap on platform settings writes (Phase 1/8 of 2026-05-08 admin audit fixes).

A new `LogPlatformSettingUpdateHandler` is shared across the four settings controllers (branding, security, billing, notifications-config). Every mutating settings write now produces a `SuperAdminActionLog` row with the `PLATFORM_SETTING_UPDATED` action type, recording previous + next value (or `'***'` for Moyasar/FCM secrets), settingKey, ipAddress, and userAgent. No-op updates (previous === next) are detected and skipped.

Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.
