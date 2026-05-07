# Changeset Workflow — Per-App Versioning & Deploys

This is the day-to-day workflow for shipping changes to production.

---

## TL;DR

```bash
# Make a change
vim apps/backend/src/modules/bookings/cancel-booking/cancel-booking.handler.ts

# Author a changeset (interactive — pick apps + bump types + write summary)
pnpm changeset

# Commit code + changeset together
git add apps/backend/ .changeset/
git commit -m "fix(bookings): cancel handler null check"
git push origin develop

# Ship it
gh workflow run promote-to-main.yml -f confirm=promote
```

That's it. The promote workflow handles everything else: version bumps, CHANGELOGs, image tags, version history.

---

## What is a "changeset"?

A `.changeset/<random>.md` file you commit alongside your code. It tells the release machinery:

- **Which apps** your change affected.
- **How big** the change is (`patch` / `minor` / `major`) per app.
- **What changed** in plain language — this becomes the entry in `apps/<app>/CHANGELOG.md`.

Example file (`.changeset/witty-narwhal-42.md`):

```markdown
---
"backend": patch
"dashboard": patch
---

Fix: cancel-booking handler crashed when employeeId was null.
The handler now treats null employees as a no-op rather than throwing,
preventing 500s on legacy bookings.
```

---

## Bump types

| Type | When to use |
|---|---|
| `patch` | Bug fix, dependency patch bump, doc fix, performance tweak — no API change |
| `minor` | New endpoint, new UI feature, additive schema change (new column, new model) — backward-compatible |
| `major` | Breaking change: removed endpoint, changed contract, destructive migration |

**Tip:** When in doubt, pick `patch`. You can always cut a `minor` later.

---

## Apps tracked

| App | Versioning | Notes |
|---|---|---|
| `backend` | ✅ Changesets | NestJS API |
| `dashboard` | ✅ Changesets | Per-tenant clinic dashboard |
| `admin` | ✅ Changesets | Super-admin control plane |
| `website` | ✅ Changesets | Public marketing site |
| `mobile` | ❌ Excluded | Per-tenant Expo builds, separate cadence |
| `@deqah/shared`, `@deqah/api-client`, `@deqah/ui` | ❌ Excluded | Internal packages, never deployed standalone |

---

## Branching policy (Hybrid)

### Direct to `develop` (no branch)

OK if **all** are true:
- Touches none of: `apps/backend/src/modules/`, `apps/backend/prisma/`, `apps/backend/src/common/tenant/`, payments/identity/platform code, `apps/admin/` business logic.
- ≤ 3 logical files.
- No new feature.
- No migration.

Examples: Docker tweak, CSS, i18n string, typo, eslint config, dependency patch.

### Feature branch + PR → `develop`

Everything else. Branch name `feat/<topic>` or `fix/<topic>`.
Squash-merge to develop. Each branch must carry its own changeset(s) before merge.

### Long-lived local branches

For multi-day work kept off `origin` (e.g. `feat/zoho-invoicing`):
Rebase onto `origin/develop` every 3–4 days. Push + PR + merge when ready.

---

## Hooks

### Pre-push (local, warning)

`.husky/pre-push` runs `scripts/changeset-check.sh`. If you push code changes
to a tracked app without a matching changeset, you get a warning. Push proceeds.

### Promote workflow (CI, blocking)

`.github/workflows/promote-to-main.yml` runs `scripts/verify-changesets.mjs`.
If any app has code changes since the last promote and there's no version bump
or pending changeset for it, **the promote fails**. Fix: add the changeset on
develop, push, retry.

---

## Reading deployed state

### What's running on production?

The Docker tag is the version. Open Dokploy, look at each service's image tag:

- `ghcr.io/tariiq222/deqah-backend:v2.0.4` → backend version 2.0.4
- `ghcr.io/tariiq222/deqah-dashboard:v0.5.2` → dashboard version 0.5.2

### What changed since last version?

Open `apps/<app>/CHANGELOG.md` on `main` (or in the deployed image — it's there too).

### Who promoted what when?

`docs/operations/version-history.md` is the per-deploy ledger.

---

## FAQ

**Q: I forgot to add a changeset and pushed already. Now what?**
A: Add it now on develop:
```bash
pnpm changeset
git add .changeset/
git commit -m "chore(changeset): cover previous fix"
git push origin develop
```
Then promote.

**Q: I added a changeset but want to change the summary.**
A: Edit `.changeset/<your-file>.md` directly. It's just markdown.

**Q: I want to skip the version bump for a tiny doc change in `apps/website/messages/en.json`.**
A: You can't skip — `messages/` is a tracked path. The right move is to bump `patch` and write a one-liner like "Updated EN copy on contact page". CHANGELOGs are cheap.

**Q: What about the old `scripts/release.sh`?**
A: Deprecated. Don't use. If you really need it: `FORCE_LEGACY=1 bash scripts/release.sh <version>`.

**Q: Build failed because version tag already exists.**
A: Someone (probably you) hand-edited `apps/<app>/package.json` and bumped to a number that was already shipped. Bump to a higher number, add a changeset, retry.
