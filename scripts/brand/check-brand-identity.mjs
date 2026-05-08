#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const productionRoots = [
  'apps/dashboard',
  'apps/admin',
  'apps/marketing',
  'apps/bespoke/sawa/website',
  'apps/mobile',
  'packages/shared',
  'packages/ui',
];

const allowedPathFragments = [
  'node_modules',
  '.next',
  '.turbo',
  'coverage',
  'design-prototypes',
  'prisma/migrations',
  'docs/superpowers/qa',
  'docs/superpowers/plans/2026-04-30-deqah-rebrand.md',
  'scripts/check-brand-identity.mjs',
  'apps/mobile/ios/Pods',
  'apps/mobile/ios/build',
  'apps/mobile/android',
  'packages/shared/constants/brand.ts',
];

const extensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.css',
  '.md',
]);

const forbidden = [
  { label: 'legacy CareKit', pattern: /\bCareKit\b/g },
  { label: 'legacy CAREKIT', pattern: /\bCAREKIT\b/g },
  { label: 'legacy carekit', pattern: /\bcarekit\b/g },
  { label: 'legacy Arabic كيركيت', pattern: /كيركيت/g },
  { label: 'legacy Arabic كير كت', pattern: /كير كت/g },
];

function extname(path) {
  const index = path.lastIndexOf('.');
  return index === -1 ? '' : path.slice(index);
}

function shouldSkip(path) {
  const rel = relative(root, path);
  return allowedPathFragments.some((fragment) => rel.includes(fragment));
}

function walk(dir, files = []) {
  if (shouldSkip(dir)) return files;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (shouldSkip(full)) continue;
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (extensions.has(extname(full))) files.push(full);
  }
  return files;
}

const findings = [];
for (const rootDir of productionRoots) {
  for (const file of walk(join(root, rootDir))) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      for (const rule of forbidden) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line)) {
          findings.push(`${relative(root, file)}:${index + 1} ${rule.label}: ${line.trim()}`);
        }
      }
    });
  }
}

if (findings.length > 0) {
  console.error('Brand identity check failed:\n');
  console.error(findings.join('\n'));
  process.exit(1);
}

console.log('Brand identity check passed.');
