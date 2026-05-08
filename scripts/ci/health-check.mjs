#!/usr/bin/env node
/**
 * scripts/ci/health-check.mjs
 *
 * Health-check a Dokploy/Swarm service from inside dokploy-network.
 *
 * Usage:
 *   node health-check.mjs --service backend --retries 5 --interval 30
 *   node health-check.mjs --service backend --port 5100 --path /api/v1/health
 *   node health-check.mjs --service dashboard --port 5103 --path /
 *
 * Service → endpoint mapping (Swarm DNS names resolved on dokploy-network):
 *   backend   → http://deqah-back-axbgpd:5100/api/v1/health
 *   dashboard → http://deqah-dashboard-<suffix>:5103/
 *   admin     → http://deqah-admin-<suffix>:5104/
 *   marketing → http://deqah-marketing-<suffix>:5106/
 *
 * NOTE: Swarm DNS names for each app are auto-discovered via `docker service ls`
 * (looking for the service whose name contains the app label) when a static
 * hostname is not deterministic. The backend is currently known as
 * "deqah-back-axbgpd". Others will be resolved dynamically.
 *
 * Exit codes:
 *   0 — HTTP 200/204 received within the retry window
 *   1 — all retries exhausted / unexpected error
 */

'use strict';

import { execSync } from 'child_process';

process.on('unhandledRejection', (err) => {
  console.error('[health-check] Unhandled rejection:', err?.message ?? err);
  process.exit(1);
});

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args    = process.argv.slice(2);
  const result  = { service: null, port: null, path: null, retries: 5, interval: 30 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--service':  result.service  = args[++i]; break;
      case '--port':     result.port     = parseInt(args[++i], 10); break;
      case '--path':     result.path     = args[++i]; break;
      case '--retries':  result.retries  = parseInt(args[++i], 10); break;
      case '--interval': result.interval = parseInt(args[++i], 10); break;
      default:
        console.error(`[health-check] Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!result.service) {
    console.error('[health-check] --service is required');
    console.error('  Usage: node health-check.mjs --service <backend|dashboard|admin|marketing>');
    console.error('         [--port <N>] [--path <path>]');
    console.error('         [--retries <N=5>] [--interval <secs=30>]');
    process.exit(1);
  }

  if (result.port !== null && (isNaN(result.port) || result.port < 1)) {
    console.error('[health-check] --port must be a positive integer');
    process.exit(1);
  }

  if (isNaN(result.retries) || result.retries < 1) {
    console.error('[health-check] --retries must be a positive integer');
    process.exit(1);
  }

  if (isNaN(result.interval) || result.interval < 1) {
    console.error('[health-check] --interval must be a positive integer (seconds)');
    process.exit(1);
  }

  return result;
}

// ─── Service → Swarm hostname resolution ─────────────────────────────────────

/**
 * Static mapping for well-known service names.
 * These are the Dokploy-generated Swarm service names.
 *
 * ASSUMPTION: backend is "deqah-back-axbgpd" (from memory snapshot).
 * dashboard/admin/marketing follow the "deqah-<app>-<5char>" pattern.
 *
 * If the static name fails, we fall back to dynamic resolution via
 * `docker service ls` — this handles Dokploy-generated suffix changes.
 *
 * --port and --path CLI args override these defaults when provided.
 */
const STATIC_SERVICE_MAP = {
  // app label → { swarmName, port, path }
  backend:   { swarmName: 'deqah-back-axbgpd',     port: 5100, path: '/api/v1/health' },
  dashboard: { swarmName: null, /* dynamic */        port: 5103, path: '/' },
  admin:     { swarmName: null, /* dynamic */        port: 5104, path: '/' },
  marketing: { swarmName: null, /* dynamic */        port: 5106, path: '/' },
};

/**
 * Resolve the Swarm service name for a given app label using `docker service ls`.
 * Looks for a service whose name starts with `deqah-<label>-` (Dokploy convention).
 *
 * @param {string} label  — e.g. "dashboard"
 * @returns {string|null} — e.g. "deqah-dashboard-ab12c"
 */
function resolveSwarmServiceName(label) {
  try {
    const output = execSync('docker service ls --format "{{.Name}}"', {
      timeout:  10_000,
      encoding: 'utf8',
      stdio:    ['pipe', 'pipe', 'pipe'],
    });
    const services = output.split('\n').map((s) => s.trim()).filter(Boolean);

    // Match "deqah-<label>-<5char>" or "deqah-<abbreviated_label>-<5char>"
    // For backend: label is "backend" but Swarm name is "deqah-back-axbgpd"
    // We try both the full label and known abbreviations.
    const abbreviations = { backend: 'back', dashboard: 'dashboard', admin: 'admin', marketing: 'marketing' };
    const abbr = abbreviations[label] ?? label;

    const match = services.find(
      (s) => s.startsWith(`deqah-${abbr}-`) || s.startsWith(`deqah-${label}-`)
    );

    return match ?? null;
  } catch (err) {
    console.warn(`[health-check] Could not run docker service ls: ${err.message}`);
    console.warn('[health-check] Are you running inside dokploy-network with Docker socket access?');
    return null;
  }
}

/**
 * Get the health check URL for a service.
 *
 * Priority:
 *  1. If SWARM_HOST_<APP> env var is set, use it (override for testing).
 *  2. Use static map if swarmName is known.
 *  3. Fall back to dynamic docker service ls resolution.
 *
 * Port/path are taken from CLI args if provided, otherwise from static map.
 *
 * @param {string} label
 * @param {number|null} portOverride   — from --port CLI arg
 * @param {string|null} pathOverride   — from --path CLI arg
 * @returns {{ url: string, swarmName: string }}
 */
function resolveHealthUrl(label, portOverride, pathOverride) {
  const config = STATIC_SERVICE_MAP[label];
  if (!config) {
    throw new Error(
      `[health-check] Unknown service label: "${label}". ` +
      `Valid labels: ${Object.keys(STATIC_SERVICE_MAP).join(', ')}`
    );
  }

  // Allow env override for testing
  const envOverride = process.env[`SWARM_HOST_${label.toUpperCase()}`];
  const host = envOverride
    ?? config.swarmName
    ?? resolveSwarmServiceName(label);

  if (!host) {
    throw new Error(
      `[health-check] Could not resolve Swarm hostname for "${label}". ` +
      `Ensure the runner is attached to dokploy-network and the service is running. ` +
      `You can override with SWARM_HOST_${label.toUpperCase()}=<hostname>.`
    );
  }

  const port = portOverride ?? config.port;
  const path = pathOverride ?? config.path;
  const url  = `http://${host}:${port}${path}`;
  return { url, swarmName: host };
}

// ─── Health check logic ───────────────────────────────────────────────────────

/**
 * Perform a single health check HTTP request.
 *
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status: number|null, error: string|null }>}
 */
async function checkOnce(url) {
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json, text/plain, */*' },
    });
    clearTimeout(timeoutId);

    const ok = res.status === 200 || res.status === 204;
    return { ok, status: res.status, error: null };
  } catch (err) {
    const error = err?.name === 'AbortError'
      ? 'Request timed out after 10s'
      : (err?.message ?? String(err));
    return { ok: false, status: null, error };
  }
}

/**
 * Run health check with retries.
 *
 * @param {string} label
 * @param {number|null} portOverride
 * @param {string|null} pathOverride
 * @param {number} retries
 * @param {number} intervalSecs
 * @returns {Promise<{ passed: boolean, finalStatus: number|null, finalError: string|null, url: string }>}
 */
async function runHealthCheck(label, portOverride, pathOverride, retries, intervalSecs) {
  const { url, swarmName } = resolveHealthUrl(label, portOverride, pathOverride);
  const ceiling = retries * intervalSecs;

  console.log(`[health-check] Service:   ${label} (${swarmName})`);
  console.log(`[health-check] URL:       ${url}`);
  console.log(`[health-check] Retries:   ${retries} × ${intervalSecs}s = ${ceiling}s ceiling`);
  console.log('');

  let lastResult = { ok: false, status: null, error: 'Not attempted' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    const ts = new Date().toISOString();
    process.stdout.write(`[health-check] [${ts}] Attempt ${attempt}/${retries} → ${url} … `);

    const result = await checkOnce(url);
    lastResult   = result;

    if (result.ok) {
      console.log(`HTTP ${result.status} ✓`);
      console.log(`[health-check] PASSED on attempt ${attempt}/${retries}`);
      return { passed: true, finalStatus: result.status, finalError: null, url };
    }

    const detail = result.status != null
      ? `HTTP ${result.status}`
      : `Error: ${result.error}`;
    console.log(`${detail} ✗`);

    if (attempt < retries) {
      console.log(`[health-check] Waiting ${intervalSecs}s before next attempt…`);
      await new Promise((r) => setTimeout(r, intervalSecs * 1_000));
    }
  }

  console.log('');
  console.log(`[health-check] FAILED — all ${retries} attempts exhausted.`);
  console.log(`[health-check] Last result: status=${lastResult.status ?? 'N/A'}, error=${lastResult.error ?? 'none'}`);

  return {
    passed:      false,
    finalStatus: lastResult.status,
    finalError:  lastResult.error,
    url,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { service, port, path, retries, interval } = parseArgs();

const result = await runHealthCheck(service, port, path, retries, interval);

if (result.passed) {
  process.exit(0);
} else {
  process.exit(1);
}
