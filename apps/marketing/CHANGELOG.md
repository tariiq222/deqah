# @deqah/marketing

## 0.2.0

### Minor Changes

- [#172](https://github.com/tariiq222/deqah/pull/172) [`0c1ba38`](https://github.com/tariiq222/deqah/commit/0c1ba3839c281ed2afddacb0fbb5cb2190145696) Thanks [@tariiq222](https://github.com/tariiq222)! - Initial release of Deqah's own marketing landing page (apps/marketing). Lightweight 4-section layout (Hero · Problem/Solution · Pricing · CTA) with bilingual AR/EN via next-intl, AR/RTL by default. Brand colors hard-coded (Royal Blue + Lime Green) since this is Deqah's own surface, not a multi-tenant one. WhatsApp CTA configurable via apps/marketing/lib/config.ts. Wired into build-images.yml + docker-compose.prod.yml + Dokploy webhook.

## 0.1.0

### Minor Changes

- Initial release of Deqah's own marketing landing page. Lightweight 4-section layout (Hero · Problem/Solution · Pricing · CTA) with bilingual AR/EN via next-intl (AR is the default RTL locale). Brand colors hard-coded since this is Deqah's own surface, not a multi-tenant one. WhatsApp CTA links configurable via `apps/marketing/lib/config.ts`. Wired into the production deploy pipeline (build-images.yml + docker-compose.prod.yml + Dokploy webhook).
