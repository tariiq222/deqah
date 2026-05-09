/**
 * Deqah Launch Readiness Checker
 *
 * Part of Runtime Orchestration System
 * Validates system readiness before production launch.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';

const results = { passed: [], failed: [], warnings: [] };

function log(category, message, status = 'INFO') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const statusColor = status === 'PASS' ? GREEN : status === 'FAIL' ? RED : status === 'WARN' ? YELLOW : BLUE;
  console.log(`${BLUE}[${timestamp}]${RESET} ${statusColor}[${status}]${RESET} ${BOLD}${category}:${RESET} ${message}`);
}

function pass(check, details = '') {
  results.passed.push({ check, details });
  log(check, details || 'OK', 'PASS');
}

function fail(check, details = '') {
  results.failed.push({ check, details });
  log(check, details, 'FAIL');
}

function warn(check, details = '') {
  results.warnings.push({ check, details });
  log(check, details, 'WARN');
}

// ============================================================================
// CHECKS
// ============================================================================

async function checkSchemaIntegrity() {
  console.log(`\n${BOLD}━━━ CHECK 1: Schema Integrity ━━━${RESET}\n`);

  const schemaDir = 'apps/backend/prisma/schema';
  const schemaFiles = [
    'main.prisma', 'identity.prisma', 'people.prisma', 'organization.prisma',
    'bookings.prisma', 'finance.prisma', 'platform.prisma', 'ai.prisma',
    'comms.prisma', 'media.prisma', 'ops.prisma',
  ];

  for (const file of schemaFiles) {
    const path = `${schemaDir}/${file}`;
    existsSync(path) ? pass('Schema exists', file) : warn('Schema exists', `${file} NOT FOUND`);
  }

  const migrationsDir = 'apps/backend/prisma/migrations';
  if (existsSync(migrationsDir)) {
    const migrations = readdirSync(migrationsDir).filter(f =>
      require('fs').statSync(`${migrationsDir}/${f}`).isDirectory()
    );
    pass('Migrations', `${migrations.length} migrations found`);
  } else {
    fail('Migrations', 'Directory not found');
  }
}

async function checkTenantIsolation() {
  console.log(`\n${BOLD}━━━ CHECK 2: Tenant Isolation ━━━${RESET}\n`);

  const checkFile = (path: string, checks: Record<string, string>) => {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      pass('File', path.split('/').pop()!);
      for (const [pattern, name] of Object.entries(checks)) {
        content.includes(pattern) ? pass(name, 'Found') : warn(name, 'Not found');
      }
    } else {
      fail('File', `${path} NOT FOUND`);
    }
  };

  checkFile('apps/backend/src/common/tenant/tenant-resolver.middleware.ts', {
    'organizationId': 'organizationId handling',
    'TENANT_ENFORCEMENT': 'TENANT_ENFORCEMENT config',
  });

  checkFile('apps/backend/src/infrastructure/database/prisma.service.ts', {
    '$extends': 'Prisma tenant extension',
    'SCOPED': 'Scoped models',
  });

  const rlsMigrationDir = 'apps/backend/prisma/migrations';
  if (existsSync(rlsMigrationDir)) {
    const dirs = readdirSync(rlsMigrationDir).filter(f =>
      require('fs').statSync(`${rlsMigrationDir}/${f}`).isDirectory()
    );
    const rlsMigration = dirs.find(d => d.includes('rls'));
    if (rlsMigration) {
      pass('RLS migration', rlsMigration);
      const sqlPath = `${rlsMigrationDir}/${rlsMigration}/migration.sql`;
      if (existsSync(sqlPath)) {
        const sql = readFileSync(sqlPath, 'utf-8');
        sql.includes('FORCE ROW LEVEL SECURITY') && pass('RLS enforced', 'FORCE ROW LEVEL SECURITY');
        sql.includes('deqah_app') && pass('deqah_app role', 'Defined');
        sql.includes('app_current_org_id') && pass('app_current_org_id function', 'Exists');
      }
    }
  }
}

async function checkSecurityPosture() {
  console.log(`\n${BOLD}━━━ CHECK 3: Security Posture ━━━${RESET}\n`);

  const checkFile = (path: string, checks: Record<string, string>) => {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      pass('File', path.split('/').pop()!);
      for (const [pattern, name] of Object.entries(checks)) {
        content.includes(pattern) ? pass(name, 'Found') : warn(name, 'Not found');
      }
    } else {
      warn('File', `${path} NOT FOUND`);
    }
  };

  checkFile('apps/backend/src/modules/identity/login/login.handler.ts', {
    'rateLimit': 'Rate limiting',
    'lockout': 'Account lockout',
  });

  checkFile('apps/backend/src/modules/finance/moyasar-webhook/moyasar-webhook.handler.ts', {
    'HMAC': 'Webhook HMAC',
    'idempotency': 'Webhook idempotency',
    'AES': 'Webhook encryption',
  });

  checkFile('apps/backend/src/main.ts', {
    'rawBody': 'Raw body for webhooks',
  });
}

async function checkCriticalFlows() {
  console.log(`\n${BOLD}━━━ CHECK 4: Critical Flows ━━━${RESET}\n`);

  const checkHandler = (path: string, name: string) => {
    if (existsSync(path)) {
      pass(`Handler: ${name}`, 'Exists');
      const content = readFileSync(path, 'utf-8');
      content.includes('transaction') ? pass(`${name} transactions`, 'Uses transactions') : warn(`${name} transactions`, 'No transactions');
      (content.includes('conflict') || content.includes('overlap') || content.includes('lock')) ?
        pass(`${name} conflict detection`, 'Found') : warn(`${name} conflict detection`, 'Not found');
    } else {
      fail(`Handler: ${name}`, 'NOT FOUND');
    }
  };

  checkHandler('apps/backend/src/modules/bookings/create-booking/create-booking.handler.ts', 'create-booking');
  checkHandler('apps/backend/src/modules/bookings/cancel-booking/cancel-booking.handler.ts', 'cancel-booking');
  checkHandler('apps/backend/src/modules/bookings/reschedule-booking/reschedule-booking.handler.ts', 'reschedule-booking');

  const financePath = 'apps/backend/src/modules/finance/';
  if (existsSync(financePath)) {
    const dirs = readdirSync(financePath);
    dirs.find(d => d.startsWith('process-payment')) && pass('Payment: process-payment', 'Exists');
    dirs.find(d => d.startsWith('verify-payment')) && pass('Payment: verify-payment', 'Exists');
  }

  existsSync('apps/backend/src/modules/platform/billing') && pass('Billing module', 'Exists');
}

async function checkDataIntegrity() {
  console.log(`\n${BOLD}━━━ CHECK 5: Data Integrity ━━━${RESET}\n`);

  const schemaDir = 'apps/backend/prisma/schema';
  const mainSchema = readFileSync(`${schemaDir}/main.prisma`, 'utf-8');

  mainSchema.includes('ActivityLog') ? pass('ActivityLog model', 'Exists') : warn('ActivityLog model', 'Not found');
  mainSchema.includes('SuperAdminActionLog') && pass('SuperAdminActionLog', 'Exists');

  const migrationsDir = 'apps/backend/prisma/migrations';
  const appendOnly = readdirSync(migrationsDir).find(d => d.includes('audit_append_only'));
  appendOnly ? pass('Append-only triggers migration', appendOnly) : warn('Append-only triggers migration', 'Not found');

  const peopleSchema = readFileSync(`${schemaDir}/people.prisma`, 'utf-8');
  peopleSchema.includes('createdAt') && peopleSchema.includes('updatedAt') && pass('Timestamp fields', 'Found');

  const bookingsSchema = readFileSync(`${schemaDir}/bookings.prisma`, 'utf-8');
  (bookingsSchema.includes('BookingStatusLog') || bookingsSchema.includes('statusLog')) && pass('Booking status log', 'Found');
}

async function checkAPIDocumentation() {
  console.log(`\n${BOLD}━━━ CHECK 6: API Documentation ━━━${RESET}\n`);

  const openApiPath = 'apps/backend/openapi.json';
  if (existsSync(openApiPath)) {
    pass('OpenAPI spec', 'Exists');
    const spec = JSON.parse(readFileSync(openApiPath, 'utf-8'));
    pass('API paths documented', `${Object.keys(spec.paths || {}).length} paths`);
  } else {
    warn('OpenAPI spec', 'NOT found');
  }
}

async function checkEnvironment() {
  console.log(`\n${BOLD}━━━ CHECK 7: Environment ━━━${RESET}\n`);

  if (existsSync('.env.example')) {
    pass('.env.example', 'Exists');
    const content = readFileSync('.env.example', 'utf-8');
    ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'].forEach(v =>
      content.includes(v) ? pass(`Env var: ${v}`, 'Documented') : fail(`Env var: ${v}`, 'NOT documented')
    );
  } else {
    fail('.env.example', 'NOT found');
  }

  existsSync('docker/docker-compose.yml') && pass('Docker Compose', 'Exists');
}

async function checkCodeQuality() {
  console.log(`\n${BOLD}━━━ CHECK 8: Code Quality ━━━${RESET}\n`);

  existsSync('apps/backend/tsconfig.json') && pass('Backend tsconfig', 'Exists');
  existsSync('apps/backend/jest.config.ts') && pass('Jest config', 'Exists');
  existsSync('apps/backend/.eslintrc.json') && pass('ESLint config', 'Exists');
  existsSync('apps/backend/.prettierrc') && pass('Prettier config', 'Exists');
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary() {
  console.log(`\n${BOLD}${'═'.repeat(60)}${RESET}\n`);
  console.log(`${BOLD}LAUNCH READINESS SUMMARY${RESET}\n`);
  console.log(`${GREEN}✓ PASSED: ${results.passed.length}${RESET}`);
  console.log(`${RED}✗ FAILED: ${results.failed.length}${RESET}`);
  console.log(`${YELLOW}⚠ WARNINGS: ${results.warnings.length}${RESET}\n`);

  if (results.failed.length > 0) {
    console.log(`${BOLD}${RED}━━━ FAILURES ━━━${RESET}\n`);
    results.failed.forEach(f => console.log(`  ${RED}✗${RESET} ${f.check}: ${f.details}`));
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log(`${BOLD}${YELLOW}━━━ WARNINGS ━━━${RESET}\n`);
    results.warnings.forEach(w => console.log(`  ${YELLOW}⚠${RESET} ${w.check}: ${w.details}`));
    console.log('');
  }

  console.log(`${BOLD}${'─'.repeat(60)}${RESET}\n`);
  results.failed.length === 0 ?
    console.log(`${GREEN}${BOLD}✓ READY FOR LAUNCH${RESET}\n`) :
    console.log(`${RED}${BOLD}✗ NOT READY - ${results.failed.length} failures${RESET}\n`);

  console.log(`Report: ${new Date().toISOString()}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

export async function runLaunchReadiness() {
  console.log(`${BOLD}${BLUE}
╔═══════════════════════════════════════════════════════════════╗
║         DEQAH LAUNCH READINESS CHECKER (Runtime)              ║
╚═══════════════════════════════════════════════════════════════╝
${RESET}`);

  await checkSchemaIntegrity();
  await checkTenantIsolation();
  await checkSecurityPosture();
  await checkCriticalFlows();
  await checkDataIntegrity();
  await checkAPIDocumentation();
  await checkEnvironment();
  await checkCodeQuality();

  printSummary();

  return {
    passed: results.passed.length,
    failed: results.failed.length,
    warnings: results.warnings.length,
    ready: results.failed.length === 0,
  };
}

// CLI
if (require.main === module) {
  runLaunchReadiness().then(r => process.exit(r.ready ? 0 : 1));
}
