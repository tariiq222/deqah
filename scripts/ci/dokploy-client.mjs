#!/usr/bin/env node
/**
 * scripts/ci/dokploy-client.mjs
 *
 * Dokploy REST API client helper for the deploy pipeline.
 *
 * Dokploy exposes a tRPC-based API. The HTTP endpoints follow:
 *   POST  /api/application.deploy       — trigger a redeploy
 *   GET   /api/application.one          — get application details (by applicationId)
 *   GET   /api/deployment.one           — get deployment status (by deploymentId)
 *   GET   /api/application.all          — list all applications
 *
 * ASSUMPTION: These endpoints were derived from Dokploy's open-source codebase
 * (github.com/Dokploy/dokploy). Verify on first run by checking:
 *   ${DOKPLOY_API_URL}/api/swagger.json  — or enable VERBOSE=true below.
 *
 * If endpoints differ, update the URL constants at the top of this file.
 *
 * Exit codes (when run as CLI):
 *   0 — success
 *   1 — API error / not found
 */

'use strict';

process.on('unhandledRejection', (err) => {
  console.error('[dokploy-client] Unhandled rejection:', err?.message ?? err);
  process.exit(1);
});

// ─── Constants ────────────────────────────────────────────────────────────────

// Dokploy tRPC HTTP endpoints (as plain REST POSTs/GETs with JSON body/query)
// VERIFY: these match Dokploy v0.x API at /api/swagger.json on first run.
const ENDPOINTS = {
  deploy:      '/api/application.deploy',
  appOne:      '/api/application.one',
  appAll:      '/api/application.all',
  deployOne:   '/api/deployment.one',
};

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS    = [1_000, 3_000]; // up to 2 retries

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Redact bearer token from any string to prevent accidental logging.
 * @param {string} text
 * @param {string} token
 * @returns {string}
 */
function redact(text, token) {
  if (!token || !text) return text;
  return text.replaceAll(token, '[REDACTED]');
}

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform a fetch with AbortSignal.timeout and up to 2 retries on network error.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {string} token  — used only for redaction in error messages
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, token) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response   = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      lastError = err;
      const isNetworkError = err?.name === 'AbortError' ||
                             err?.code  === 'ECONNREFUSED' ||
                             err?.code  === 'ENOTFOUND' ||
                             err?.code  === 'ETIMEDOUT' ||
                             err?.type  === 'system';
      if (!isNetworkError || attempt >= RETRY_DELAYS_MS.length) {
        throw new Error(
          `[dokploy-client] Network error reaching ${redact(url, token)}: ` +
          `${redact(err?.message ?? String(err), token)}`
        );
      }
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(
        `[dokploy-client] Attempt ${attempt + 1} failed — retrying in ${delay}ms…`
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

/**
 * Build common headers for Dokploy API requests.
 * @param {string} token
 * @returns {Record<string, string>}
 */
function buildHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  };
}

/**
 * Parse a Dokploy JSON response, with helpful error messages on 401/403/404.
 *
 * @param {Response} res
 * @param {string}   token      — for redaction
 * @param {string}   context    — e.g. "triggerDeploy"
 * @param {Function} [onNotFound] — optional async fn called on 404, return value is rethrown
 * @returns {Promise<unknown>}
 */
async function parseResponse(res, token, context, onNotFound) {
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `[dokploy-client] ${context}: Authentication failed (HTTP ${res.status}). ` +
      `The DOKPLOY_API_TOKEN may be expired or invalid. ` +
      `Regenerate it in Dokploy → Settings → API Tokens and update the GitHub secret.`
    );
  }

  if (res.status === 404) {
    if (onNotFound) {
      // Caller handles 404 specially (e.g. by listing all apps)
      throw await onNotFound(body);
    }
    throw new Error(
      `[dokploy-client] ${context}: Resource not found (HTTP 404). ` +
      `Body: ${redact(JSON.stringify(body), token)}`
    );
  }

  if (!res.ok) {
    throw new Error(
      `[dokploy-client] ${context}: HTTP ${res.status} — ` +
      `${redact(JSON.stringify(body), token)}`
    );
  }

  return body;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List all Dokploy applications.
 *
 * @param {{ apiUrl: string, token: string }} opts
 * @returns {Promise<Array<{ applicationId: string, name: string, appName: string, [key: string]: unknown }>>}
 */
export async function listApplications({ apiUrl, token }) {
  const url = `${apiUrl}${ENDPOINTS.appAll}`;
  const res  = await fetchWithRetry(url, {
    method:  'GET',
    headers: buildHeaders(token),
  }, token);

  const data = await parseResponse(res, token, 'listApplications');
  return Array.isArray(data) ? data : (data?.result ?? []);
}

/**
 * Find a Dokploy application by its name (the "name" field in the UI).
 *
 * Dokploy names are typically set by the user when creating the service.
 * This function lists all apps and finds the first whose `name` or `appName`
 * matches (case-insensitive). If none found, it logs all known names and throws.
 *
 * @param {{ apiUrl: string, token: string, name: string }} opts
 * @returns {Promise<{ applicationId: string, name: string, [key: string]: unknown }>}
 */
export async function getApplicationByName({ apiUrl, token, name }) {
  const apps = await listApplications({ apiUrl, token });

  const match = apps.find(
    (a) =>
      a.name?.toLowerCase()    === name.toLowerCase() ||
      a.appName?.toLowerCase() === name.toLowerCase()
  );

  if (!match) {
    const known = apps.map((a) => `  • ${a.name ?? '(unnamed)'}  [id: ${a.applicationId}]`).join('\n');
    throw new Error(
      `[dokploy-client] getApplicationByName: No application named "${name}" found in Dokploy.\n` +
      `Known applications:\n${known || '  (none)'}\n\n` +
      `Check that the app name matches exactly what appears in the Dokploy UI ` +
      `or update the APP_NAMES mapping in the workflow.`
    );
  }

  return match;
}

/**
 * Trigger a Dokploy application redeploy.
 *
 * @param {{ apiUrl: string, token: string, applicationId: string }} opts
 * @returns {Promise<{ deploymentId: string, [key: string]: unknown }>}
 */
export async function triggerDeploy({ apiUrl, token, applicationId }) {
  const url = `${apiUrl}${ENDPOINTS.deploy}`;
  const res  = await fetchWithRetry(url, {
    method:  'POST',
    headers: buildHeaders(token),
    body:    JSON.stringify({ applicationId }),
  }, token);

  const data = await parseResponse(res, token, 'triggerDeploy', async (body) => {
    // 404 on deploy usually means wrong applicationId
    return new Error(
      `[dokploy-client] triggerDeploy: Application ID "${applicationId}" not found (HTTP 404). ` +
      `Run listApplications() to see available IDs. Body: ${redact(JSON.stringify(body), token)}`
    );
  });

  // Dokploy may return the deployment in result.deploymentId or directly
  const deploymentId = data?.deploymentId ?? data?.result?.deploymentId;
  if (!deploymentId) {
    // Dokploy sometimes just returns 200 with the app object (no deployment id).
    // In that case we return a synthetic object; the caller must use status polling
    // against the applicationId instead.
    console.warn(
      `[dokploy-client] triggerDeploy: No deploymentId in response. ` +
      `Will poll by applicationId instead. Response: ${redact(JSON.stringify(data), token)}`
    );
    return { deploymentId: null, applicationId, raw: data };
  }

  return { deploymentId, applicationId, raw: data };
}

/**
 * Get the status of a Dokploy deployment.
 *
 * @param {{ apiUrl: string, token: string, deploymentId: string, applicationId?: string }} opts
 * @returns {Promise<{ status: 'queued'|'running'|'success'|'failed'|'unknown', raw: unknown }>}
 */
export async function getDeployStatus({ apiUrl, token, deploymentId, applicationId }) {
  // If we have a deploymentId, use the deployment endpoint.
  // If not (Dokploy didn't return one), fall back to checking the latest
  // deployment on the application itself.
  let data;

  if (deploymentId) {
    const url = `${apiUrl}${ENDPOINTS.deployOne}?deploymentId=${encodeURIComponent(deploymentId)}`;
    const res  = await fetchWithRetry(url, {
      method:  'GET',
      headers: buildHeaders(token),
    }, token);
    data = await parseResponse(res, token, 'getDeployStatus');
  } else if (applicationId) {
    // Fallback: fetch app details and inspect deploymentStatus
    const url = `${apiUrl}${ENDPOINTS.appOne}?applicationId=${encodeURIComponent(applicationId)}`;
    const res  = await fetchWithRetry(url, {
      method:  'GET',
      headers: buildHeaders(token),
    }, token);
    data = await parseResponse(res, token, 'getDeployStatus(appFallback)');
  } else {
    throw new Error(
      '[dokploy-client] getDeployStatus: either deploymentId or applicationId must be provided'
    );
  }

  // Normalize Dokploy status values to our canonical set.
  // Dokploy uses: "queued", "running", "done", "error", "cancelled"
  // ASSUMPTION: status field is at data.status or data.result.status
  const rawStatus = (data?.status ?? data?.result?.status ?? 'unknown').toLowerCase();

  /** @type {'queued'|'running'|'success'|'failed'|'unknown'} */
  let status;
  switch (rawStatus) {
    case 'queued':
    case 'pending':
      status = 'queued';
      break;
    case 'running':
    case 'in_progress':
      status = 'running';
      break;
    case 'done':
    case 'success':
    case 'succeeded':
      status = 'success';
      break;
    case 'error':
    case 'failed':
    case 'failure':
    case 'cancelled':
    case 'canceled':
      status = 'failed';
      break;
    default:
      status = 'unknown';
  }

  return { status, raw: data };
}

// ─── CLI entry point (for debugging / manual verification) ───────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args   = process.argv.slice(2);
  const apiUrl = process.env.DOKPLOY_API_URL;
  const token  = process.env.DOKPLOY_API_TOKEN;

  if (!apiUrl || !token) {
    console.error('Usage: DOKPLOY_API_URL=https://... DOKPLOY_API_TOKEN=... node dokploy-client.mjs <command>');
    console.error('Commands: list | get-app <name> | status <deploymentId>');
    process.exit(1);
  }

  const [cmd, ...cmdArgs] = args;

  try {
    switch (cmd) {
      case 'list': {
        const apps = await listApplications({ apiUrl, token });
        console.log(JSON.stringify(apps.map((a) => ({
          id:      a.applicationId,
          name:    a.name,
          appName: a.appName,
          status:  a.applicationStatus ?? a.status,
        })), null, 2));
        break;
      }
      case 'get-app': {
        const name = cmdArgs[0];
        if (!name) { console.error('Usage: get-app <name>'); process.exit(1); }
        const app = await getApplicationByName({ apiUrl, token, name });
        console.log(JSON.stringify({ id: app.applicationId, name: app.name }, null, 2));
        break;
      }
      case 'status': {
        const deploymentId = cmdArgs[0];
        if (!deploymentId) { console.error('Usage: status <deploymentId>'); process.exit(1); }
        const result = await getDeployStatus({ apiUrl, token, deploymentId });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
