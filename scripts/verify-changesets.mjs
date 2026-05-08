#!/usr/bin/env node
// scripts/verify-changesets.mjs
//
// CI gate run by promote-to-main.yml BEFORE sanitize.
//
// Logic:
//   1. List files changed between origin/main and HEAD.
//   2. For each of {backend, dashboard, admin, marketing}, determine if its source paths changed.
//   3. For each touched app, check that EITHER:
//        a) apps/<app>/package.json `version` differs from what's on origin/main, OR
//        b) at least one .changeset/*.md file declares a bump for that app
//      (case (b) means changeset version will run later in this same CI job).
//   4. If any touched app has neither — exit 1 with a clear error.
//
// Exit codes:
//   0 = all good
//   1 = missing changeset/version for at least one touched app
//   2 = unexpected internal error

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Apps whose changes must carry a changeset before promote can succeed.
// Sawa website (apps/bespoke/sawa/website) is intentionally excluded — paused
// from the production pipeline as of 2026-05-08. Re-add when it rejoins.
const APPS = ["backend", "dashboard", "admin", "marketing"];
const APP_PATH_RE = (app) =>
  new RegExp(
    `^apps/${app}/(src|prisma|app|components|public|lib|messages|next\\.config|Dockerfile|package\\.json|tsconfig)`
  );

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function shOk(cmd) {
  const r = spawnSync("bash", ["-c", cmd], { encoding: "utf8" });
  return { ok: r.status === 0, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(msg) {
  console.error("");
  console.error("══════════════════════════════════════════════════════════════════════");
  console.error(" ❌ Promote BLOCKED — missing changeset(s) or version bump(s)");
  console.error("══════════════════════════════════════════════════════════════════════");
  console.error(msg);
  console.error("");
  console.error("To fix:");
  console.error("  1. git checkout develop");
  console.error("  2. pnpm changeset                 # interactive — pick apps + bump types + summary");
  console.error("  3. git add .changeset/ && git commit -m 'chore(changeset): describe change'");
  console.error("  4. git push origin develop");
  console.error("  5. gh workflow run promote-to-main.yml -f confirm=promote");
  console.error("");
  process.exit(1);
}

function panic(msg) {
  console.error(`[verify-changesets] internal error: ${msg}`);
  process.exit(2);
}

// 1. Find the baseline to diff against.
//
// We CANNOT use origin/main — the sanitizer produces an orphan tree on every
// promote, so there's no merge base, and the two-dot diff falsely flags every
// stripped file (CLAUDE.md, e2e/, .changeset/, …) as "changed since main".
//
// Instead, the previous "promoted state" is the last `chore(release): version
// packages` commit on the current branch — that's the commit the promote
// workflow writes after consuming changesets. Anything between that commit
// and HEAD is genuine new work that needs a changeset (or a version bump).
//
// First promote ever has no such commit; we fall through to "everything is new"
// and trust the developer authored a covering changeset.
shOk("git fetch origin develop --depth=200");
const lastReleaseCommit = shOk(
  "git log --grep='^chore(release): version packages' --format=%H -n 1"
);

let baseline;
if (lastReleaseCommit.ok && lastReleaseCommit.stdout) {
  baseline = lastReleaseCommit.stdout;
  console.log(`[verify-changesets] baseline: last release commit ${baseline.slice(0, 8)}`);
} else {
  // First-promote bootstrap: no prior release commit. Diff against the merge
  // base with origin/main if available; otherwise treat all current files as
  // "new" and require a covering changeset.
  console.log("[verify-changesets] no prior release commit — first-promote bootstrap mode");
  shOk("git fetch origin main --depth=50");
  const mergeBase = shOk("git merge-base origin/main HEAD");
  baseline = mergeBase.ok && mergeBase.stdout ? mergeBase.stdout : "HEAD~1";
}

// 2. List changed files between baseline and HEAD
const diff = shOk(`git diff --name-only ${baseline} HEAD`);
if (!diff.ok) {
  panic(`git diff ${baseline}..HEAD failed: ${diff.stderr}`);
}
const changedFiles = diff.stdout;

if (!changedFiles) {
  console.log("[verify-changesets] no changes vs origin/main — nothing to verify.");
  process.exit(0);
}

const changedFilesArr = changedFiles.split("\n").filter(Boolean);

// 3. Determine touched apps
const touchedApps = APPS.filter((app) =>
  changedFilesArr.some((f) => APP_PATH_RE(app).test(f))
);

if (touchedApps.length === 0) {
  console.log("[verify-changesets] no app code changed — nothing to verify.");
  process.exit(0);
}

console.log(`[verify-changesets] touched apps: ${touchedApps.join(", ")}`);

// 4. Read pending changeset files
const changesetDir = ".changeset";
let pendingChangesets = [];
if (existsSync(changesetDir)) {
  pendingChangesets = readdirSync(changesetDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({
      file: join(changesetDir, f),
      content: readFileSync(join(changesetDir, f), "utf8"),
    }));
}

console.log(`[verify-changesets] pending changesets: ${pendingChangesets.length}`);

// Helper: does any pending changeset bump this app?
function changesetBumpsApp(app) {
  const re = new RegExp(`^"${app}":\\s*(patch|minor|major)`, "m");
  return pendingChangesets.some((cs) => re.test(cs.content));
}

// Helper: did this app's package.json version change vs baseline?
function appVersionChanged(app) {
  const pkgPath = `apps/${app}/package.json`;
  const headVersion = readJSON(pkgPath).version;
  const basePkgRaw = shOk(`git show ${baseline}:${pkgPath}`);
  if (!basePkgRaw.ok) {
    // app's package.json doesn't exist at baseline — counts as a version change
    return true;
  }
  const baseVersion = JSON.parse(basePkgRaw.stdout).version;
  return headVersion !== baseVersion;
}

// 5. Verify each touched app
const missing = [];
for (const app of touchedApps) {
  const versionBumped = appVersionChanged(app);
  const hasChangeset = changesetBumpsApp(app);
  console.log(
    `[verify-changesets]   ${app}: versionBumped=${versionBumped}, hasChangeset=${hasChangeset}`
  );
  if (!versionBumped && !hasChangeset) {
    missing.push(app);
  }
}

if (missing.length > 0) {
  fail(
    ` Apps with code changes but no version bump and no pending changeset:\n` +
      missing.map((a) => `   • ${a}`).join("\n")
  );
}

console.log("[verify-changesets] ✅ all touched apps have a changeset or version bump.");
process.exit(0);
