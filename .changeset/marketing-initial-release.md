---
"@deqah/marketing": minor
---

Initial release of Deqah's own marketing landing page (apps/marketing). Lightweight 4-section layout (Hero · Problem/Solution · Pricing · CTA) with bilingual AR/EN via next-intl, AR/RTL by default. Brand colors hard-coded (Royal Blue + Lime Green) since this is Deqah's own surface, not a multi-tenant one. WhatsApp CTA configurable via apps/marketing/lib/config.ts. Wired into build-images.yml + docker-compose.prod.yml + Dokploy webhook.
