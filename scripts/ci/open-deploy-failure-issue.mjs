#!/usr/bin/env node
/**
 * scripts/ci/open-deploy-failure-issue.mjs
 *
 * Opens (or comments on an existing) GitHub Issue when a deploy fails.
 *
 * Usage (all params via env vars — avoids leaking secrets into argv):
 *
 *   GITHUB_TOKEN=...         Required. GitHub token with issues:write permission.
 *   GITHUB_REPOSITORY=...   Required. e.g. "tariiq222/deqah"
 *   DEPLOY_APP=...           Required. e.g. "backend"
 *   DEPLOY_STAGE=...         Required. "deploy|health|rollback|catastrophic"
 *   DEPLOY_SHA=...           Required. Full commit SHA.
 *   DEPLOY_ACTOR=...         Required. GitHub actor who triggered the run.
 *   DEPLOY_RUN_URL=...       Required. URL to the GitHub Actions run.
 *   DEPLOY_PREVIOUS_IMAGE=.. Optional. Image before the deploy.
 *   DEPLOY_CURRENT_IMAGE=... Optional. Image after the deploy.
 *   DEPLOY_HEALTH_OUTPUT=... Optional. Last health check output/error.
 *   DEPLOY_DOCKER_LOGS=...   Optional. Last 50 lines of docker service logs.
 *
 * Idempotency: searches for an open issue titled exactly:
 *   "Deploy failure: <app> @ <sha[0..7]>"
 * If found, adds a comment. If not found, creates a new issue.
 *
 * Exit codes:
 *   0 — issue created or comment posted
 *   1 — error
 */

'use strict';

process.on('unhandledRejection', (err) => {
  console.error('[open-deploy-failure-issue] Unhandled rejection:', err?.message ?? err);
  process.exit(1);
});

// ─── Config from env ──────────────────────────────────────────────────────────

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`[open-deploy-failure-issue] Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const GITHUB_TOKEN      = requireEnv('GITHUB_TOKEN');
const GITHUB_REPOSITORY = requireEnv('GITHUB_REPOSITORY');   // "owner/repo"
const DEPLOY_APP        = requireEnv('DEPLOY_APP');
const DEPLOY_STAGE      = requireEnv('DEPLOY_STAGE');
const DEPLOY_SHA        = requireEnv('DEPLOY_SHA');
const DEPLOY_ACTOR      = requireEnv('DEPLOY_ACTOR');
const DEPLOY_RUN_URL    = requireEnv('DEPLOY_RUN_URL');

const DEPLOY_PREVIOUS_IMAGE = process.env.DEPLOY_PREVIOUS_IMAGE ?? '(unknown)';
const DEPLOY_CURRENT_IMAGE  = process.env.DEPLOY_CURRENT_IMAGE  ?? '(unknown)';
const DEPLOY_HEALTH_OUTPUT  = process.env.DEPLOY_HEALTH_OUTPUT  ?? '(not captured)';
const DEPLOY_DOCKER_LOGS    = process.env.DEPLOY_DOCKER_LOGS    ?? '(not captured)';

const [REPO_OWNER, REPO_NAME] = GITHUB_REPOSITORY.split('/');
const SHA_SHORT               = DEPLOY_SHA.slice(0, 7);
const ISSUE_TITLE             = `Deploy failure: ${DEPLOY_APP} @ ${SHA_SHORT}`;

// ─── GitHub API helpers ───────────────────────────────────────────────────────

const GH_API = 'https://api.github.com';

function ghHeaders() {
  return {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept':        'application/vnd.github+json',
    'Content-Type':  'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ghFetch(path, options = {}) {
  const url = `${GH_API}${path}`;
  const res  = await fetch(url, { ...options, headers: { ...ghHeaders(), ...(options.headers ?? {}) } });

  let body;
  try { body = await res.json(); }
  catch { body = null; }

  if (!res.ok) {
    throw new Error(
      `[open-deploy-failure-issue] GitHub API ${options.method ?? 'GET'} ${path} → HTTP ${res.status}: ` +
      `${JSON.stringify(body)}`
    );
  }
  return body;
}

// ─── Issue search (idempotency) ───────────────────────────────────────────────

/**
 * Search for an open issue with the exact title.
 * GitHub search can be laggy — we also do a direct listing as a fallback.
 *
 * @returns {Promise<number|null>} — issue number or null
 */
async function findExistingIssue() {
  // Try GitHub issues search first (most reliable when there are many issues)
  try {
    const q   = encodeURIComponent(`repo:${GITHUB_REPOSITORY} is:open is:issue in:title "${ISSUE_TITLE}"`);
    const res = await ghFetch(`/search/issues?q=${q}&per_page=5`);
    const match = (res?.items ?? []).find((i) => i.title === ISSUE_TITLE);
    if (match) return match.number;
  } catch (err) {
    console.warn(`[open-deploy-failure-issue] Search API failed (${err.message}) — falling back to list.`);
  }

  // Fallback: list recent open issues and scan titles
  try {
    const issues = await ghFetch(
      `/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&labels=deploy-failure&per_page=50`
    );
    const match  = (issues ?? []).find((i) => i.title === ISSUE_TITLE);
    if (match) return match.number;
  } catch {
    // If this also fails we proceed to create
  }

  return null;
}

// ─── Issue body builder ───────────────────────────────────────────────────────

function stageEmoji(stage) {
  const map = { deploy: '🚀', health: '🏥', rollback: '⏪', catastrophic: '🔴' };
  return map[stage] ?? '❌';
}

function buildNextSteps(stage) {
  const steps = {
    deploy: `
- Check Dokploy logs: navigate to the app in Dokploy UI → Deployments → latest
- Verify \`DOKPLOY_API_URL\` and \`DOKPLOY_API_TOKEN\` secrets are valid
- Re-trigger the workflow manually if the failure was transient`,

    health: `
- The image deployed but the service is not healthy
- SSH into VPS and run: \`docker service ps deqah-<service> --no-trunc\`
- Check recent logs: \`docker service logs deqah-<service> --tail 100\`
- Verify health endpoint responds locally: \`curl http://localhost:<port>/api/v1/health\`
- If the previous image was good, roll back manually: \`docker service update --rollback deqah-<service>\``,

    rollback: `
- Automatic rollback was attempted but also failed
- Previous image: \`${DEPLOY_PREVIOUS_IMAGE}\`
- Manually force-restore: \`docker service update --image ${DEPLOY_PREVIOUS_IMAGE} deqah-<service>\`
- If the previous image is also broken, check for migration issues`,

    catastrophic: `
- CRITICAL: both deploy and all rollback attempts failed
- The service may be in a broken state
- **Immediate action required:**
  1. Restore manually: \`docker service update --image ${DEPLOY_PREVIOUS_IMAGE} deqah-<service>\`
  2. Verify: \`curl http://localhost:<port>/api/v1/health\`
  3. If DB migration is the root cause, check: \`docker service logs deqah-backend --tail 100 | grep -i prisma\`
  4. To disable auto-rollback on next run: set repo variable \`DEPLOY_ROLLBACK_DISABLED=true\``,
  };
  return steps[stage] ?? '- Investigate manually.';
}

function buildIssueBody() {
  return `## ${stageEmoji(DEPLOY_STAGE)} Deploy Failure Report

| Field | Value |
|-------|-------|
| **App** | \`${DEPLOY_APP}\` |
| **Stage** | \`${DEPLOY_STAGE}\` |
| **Commit** | \`${DEPLOY_SHA}\` |
| **Actor** | @${DEPLOY_ACTOR} |
| **Workflow run** | [View run](${DEPLOY_RUN_URL}) |
| **Previous image** | \`${DEPLOY_PREVIOUS_IMAGE}\` |
| **Current image** | \`${DEPLOY_CURRENT_IMAGE}\` |

---

### Health Check Output (final attempt)

\`\`\`
${DEPLOY_HEALTH_OUTPUT}
\`\`\`

---

### Docker Service Logs (last 50 lines)

\`\`\`
${DEPLOY_DOCKER_LOGS}
\`\`\`

---

### Suggested Next Steps
${buildNextSteps(DEPLOY_STAGE)}

---

*Auto-generated by [build-images.yml](${DEPLOY_RUN_URL}) — \`open-deploy-failure-issue.mjs\`*
`;
}

function buildCommentBody() {
  return `## ${stageEmoji(DEPLOY_STAGE)} New failure on \`${SHA_SHORT}\` (${DEPLOY_STAGE})

| Field | Value |
|-------|-------|
| **Workflow run** | [View run](${DEPLOY_RUN_URL}) |
| **Previous image** | \`${DEPLOY_PREVIOUS_IMAGE}\` |
| **Current image** | \`${DEPLOY_CURRENT_IMAGE}\` |

<details>
<summary>Health check output</summary>

\`\`\`
${DEPLOY_HEALTH_OUTPUT}
\`\`\`
</details>

<details>
<summary>Docker logs (last 50 lines)</summary>

\`\`\`
${DEPLOY_DOCKER_LOGS}
\`\`\`
</details>

${buildNextSteps(DEPLOY_STAGE)}
`;
}

// ─── Ensure labels exist ───────────────────────────────────────────────────────

async function ensureLabel(name, color, description) {
  try {
    await ghFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/labels/${encodeURIComponent(name)}`);
    // Label exists
  } catch {
    // Create it
    try {
      await ghFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/labels`, {
        method: 'POST',
        body:   JSON.stringify({ name, color, description }),
      });
      console.log(`[open-deploy-failure-issue] Created label: ${name}`);
    } catch (createErr) {
      console.warn(`[open-deploy-failure-issue] Could not create label "${name}": ${createErr.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Ensure required labels exist
await ensureLabel('incident',       'B60205', 'Production incident');
await ensureLabel('deploy-failure', 'E4E669', 'Automated deploy failure');
await ensureLabel(DEPLOY_APP,       '0075CA', `${DEPLOY_APP} service`);

const existingIssueNumber = await findExistingIssue();

if (existingIssueNumber) {
  console.log(`[open-deploy-failure-issue] Found existing issue #${existingIssueNumber} — adding comment.`);

  await ghFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${existingIssueNumber}/comments`, {
    method: 'POST',
    body:   JSON.stringify({ body: buildCommentBody() }),
  });

  console.log(`[open-deploy-failure-issue] Comment posted to issue #${existingIssueNumber}`);
  console.log(`[open-deploy-failure-issue] URL: https://github.com/${GITHUB_REPOSITORY}/issues/${existingIssueNumber}`);
} else {
  console.log(`[open-deploy-failure-issue] No existing issue found — creating new issue.`);

  const issue = await ghFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    method: 'POST',
    body:   JSON.stringify({
      title:    ISSUE_TITLE,
      body:     buildIssueBody(),
      labels:   ['incident', 'deploy-failure', DEPLOY_APP],
      assignees: ['tariiq222'],
    }),
  });

  console.log(`[open-deploy-failure-issue] Issue #${issue.number} created.`);
  console.log(`[open-deploy-failure-issue] URL: ${issue.html_url}`);
}
