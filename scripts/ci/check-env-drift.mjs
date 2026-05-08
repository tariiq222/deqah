#!/usr/bin/env node
/**
 * scripts/ci/check-env-drift.mjs
 *
 * Detects drift between the Joi validation schema (source of truth for required
 * env vars) and docker/.env.prod.example (operator documentation).
 *
 * Design note: We use a regex-based parser rather than importing the Joi schema
 * at runtime. Reason: env.validation.ts uses conditional Joi expressions
 * (process.env.RELAX_PROD_VALIDATION checks) that would require executing the
 * TypeScript module — which means tsx + NestJS boot overhead just to list keys.
 * A regex parser is simpler, faster, and good enough: the schema file has a
 * consistent structure (one key per line, obvious `.required()` calls or
 * `NODE_ENV === 'production'` conditionals that imply required-in-prod).
 *
 * "Required" definition used here:
 *   - Unconditionally required: line matches `KEY: Joi.xxx(...).required()`
 *   - Conditionally required in prod: line has `.required()` inside a
 *     `Joi.when('NODE_ENV', { is: 'production', then: Joi.xxx().required() })`
 *     block — we detect these via a two-pass scan of the source.
 *
 * Exit codes:
 *   0  — no drift
 *   1  — drift detected (missing or extra keys)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const SCHEMA_PATH = resolve(REPO_ROOT, 'apps/backend/src/config/env.validation.ts');
const EXAMPLE_PATH = resolve(REPO_ROOT, 'docker/.env.prod.example');

// ─── Parse Joi schema ─────────────────────────────────────────────────────────

/**
 * Returns the set of env-var keys that are REQUIRED (unconditionally or in
 * production). Keys that are always optional (`.allow('').optional()`) are
 * excluded unless they also have a `required()` path for production.
 */
function parseRequiredKeys(src) {
  const required = new Set();

  const lines = src.split('\n');

  // Pass 1: unconditionally required — `KEY: Joi.xxx().required()`
  // Matches lines like:
  //   DATABASE_URL: Joi.string().uri(...).required(),
  //   REDIS_HOST: Joi.string().hostname().required(),
  const unconditionalRe = /^\s{2}([A-Z][A-Z0-9_]+):\s+Joi\.[^,]+\.required\(\)/;
  for (const line of lines) {
    const m = line.match(unconditionalRe);
    if (m) {
      required.add(m[1]);
    }
  }

  // Pass 2: conditionally required in production via Joi.when('NODE_ENV', ...)
  // Pattern:
  //   KEY: Joi.when('NODE_ENV', {
  //     is: 'production',
  //     then: Joi.string().required(),
  //   ...
  // We track state: when we see `KEY: Joi.when('NODE_ENV'`, set currentKey.
  // When inside that block we see `is: 'production'` AND `then: Joi.xxx.required()`,
  // add currentKey.
  let currentKey = null;
  let inWhenBlock = false;
  let braceDepth = 0;
  let sawProductionIs = false;
  let sawProductionThenRequired = false;

  const keyWhenRe = /^\s{2}([A-Z][A-Z0-9_]+):\s+Joi\.when\(/;
  const isProductionRe = /is:\s*'production'/;
  const thenRequiredRe = /then:\s*Joi\.[^,]+\.required\(\)/;

  for (const line of lines) {
    const kwm = line.match(keyWhenRe);
    if (kwm) {
      // Flush previous if any
      if (currentKey && inWhenBlock && sawProductionIs && sawProductionThenRequired) {
        required.add(currentKey);
      }
      currentKey = kwm[1];
      inWhenBlock = true;
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      sawProductionIs = false;
      sawProductionThenRequired = false;
      continue;
    }

    if (inWhenBlock) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      if (isProductionRe.test(line)) sawProductionIs = true;
      if (thenRequiredRe.test(line)) sawProductionThenRequired = true;

      if (braceDepth <= 0) {
        if (currentKey && sawProductionIs && sawProductionThenRequired) {
          required.add(currentKey);
        }
        currentKey = null;
        inWhenBlock = false;
        sawProductionIs = false;
        sawProductionThenRequired = false;
      }
    }
  }

  // Pass 3: RELAX_PROD_VALIDATION conditional pattern
  // These look like:
  //   KEY: process.env.RELAX_PROD_VALIDATION === 'true'
  //     ? Joi.string().allow('').optional()
  //     : Joi.string().required()
  // The "real" (non-relaxed) branch is the else-branch (after `:`).
  // If the else-branch has `.required()`, treat it as required.
  const relaxRe = /^\s{2}([A-Z][A-Z0-9_]+):\s+process\.env\.RELAX_PROD_VALIDATION/;
  for (let i = 0; i < lines.length; i++) {
    const rm = lines[i].match(relaxRe);
    if (rm) {
      // Look ahead up to 4 lines for the `: Joi.xxx.required()` else-branch
      const key = rm[1];
      const window = lines.slice(i, i + 6).join(' ');
      // The else branch (after `: Joi.when` or `: Joi.string...required()`)
      if (/:\s+Joi\.[^?]+\.required\(\)/.test(window)) {
        required.add(key);
      }
    }
  }

  return required;
}

// ─── Parse .env.prod.example ──────────────────────────────────────────────────

function parseExampleKeys(src) {
  const keys = new Set();
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
      keys.add(key);
    }
  }
  return keys;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const schemaSrc = readFileSync(SCHEMA_PATH, 'utf8');
const exampleSrc = readFileSync(EXAMPLE_PATH, 'utf8');

const joiRequired = parseRequiredKeys(schemaSrc);
const exampleKeys = parseExampleKeys(exampleSrc);

const missing = [...joiRequired].filter((k) => !exampleKeys.has(k));
const extra = [...exampleKeys].filter((k) => !joiRequired.has(k));

let hasError = false;

if (missing.length > 0) {
  hasError = true;
  console.error('');
  console.error('❌  MISSING from docker/.env.prod.example (required by Joi schema):');
  for (const k of missing.sort()) {
    console.error(`     ${k}`);
  }
}

if (extra.length > 0) {
  // Extra keys are a warning — they may be infra-level vars (POSTGRES_USER etc.)
  // not in the Joi schema but still valid for docker-compose. We print them but
  // do NOT exit 1 for extras alone, because docker-compose has its own vars.
  console.warn('');
  console.warn('ℹ️   Extra keys in docker/.env.prod.example (not in Joi required set):');
  for (const k of extra.sort()) {
    console.warn(`     ${k}`);
  }
  console.warn('    These may be valid docker-compose vars. Verify manually.');
}

if (!hasError && missing.length === 0) {
  console.log('');
  console.log(`✅  No drift detected.`);
  console.log(`    Joi required keys : ${joiRequired.size}`);
  console.log(`    Example keys      : ${exampleKeys.size}`);
  console.log('');
}

if (hasError) {
  console.error('');
  console.error('Run: update docker/.env.prod.example to add the missing keys.');
  console.error('');
  process.exit(1);
}
