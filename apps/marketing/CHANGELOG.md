# @deqah/marketing

## 0.1.0

### Minor Changes

- Initial release of Deqah's own marketing landing page. Lightweight 4-section layout (Hero · Problem/Solution · Pricing · CTA) with bilingual AR/EN via next-intl (AR is the default RTL locale). Brand colors hard-coded since this is Deqah's own surface, not a multi-tenant one. WhatsApp CTA links configurable via `apps/marketing/lib/config.ts`. Wired into the production deploy pipeline (build-images.yml + docker-compose.prod.yml + Dokploy webhook).
