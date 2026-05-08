---
"backend": patch
---

Make `hCaptchaToken` optional in 6 auth/OTP DTOs (`LoginDto`, `ClientLoginDto`, `RegisterDto`, `ResetPasswordDto`, `RequestOtpDto`, `VerifyOtpDto`). The captcha verifier was already a no-op in v2.1.3, but DTO-level `@IsNotEmpty()` was still rejecting requests when frontends sent expired or empty hCaptcha tokens. Frontends remain unchanged — they continue sending the field, which the backend now accepts and ignores. Per-account lockout (5 attempts → 15-minute lock) remains the brute-force defense until Cloudflare Turnstile lands.
