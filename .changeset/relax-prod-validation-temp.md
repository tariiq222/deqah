---
"backend": patch
---

Add `RELAX_PROD_VALIDATION` env flag — temporary escape hatch that downgrades Zoho + hCaptcha env validation to optional in production, so the platform can boot before real credentials are populated. All other prod safety (JWT, Moyasar tenant key, encryption keys, placeholder rejection) remains strict. Remove once real keys land in Dokploy.
