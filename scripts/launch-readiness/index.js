#!/usr/bin/env node
/**
 * Deqah Launch Readiness Checker v2
 *
 * Comprehensive pre-launch validation for Deqah SaaS platform.
 *
 * Usage: node scripts/launch-readiness/index.js
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

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

const fs = await import('fs');

// ============================================================================
// CHECK 1: Schema Integrity
// ============================================================================

async function checkSchemaIntegrity() {
  console.log(`\n${BOLD}━━━ CHECK 1: Schema Integrity ━━━${RESET}\n`);

  const schemaDir = 'apps/backend/prisma/schema';
  const schemaFiles = [
    'main.prisma',
    'identity.prisma',
    'people.prisma',
    'organization.prisma',
    'bookings.prisma',
    'finance.prisma',
    'platform.prisma',
    'ai.prisma',
    'comms.prisma',
    'media.prisma',
    'ops.prisma',
  ];

  for (const file of schemaFiles) {
    const path = `${schemaDir}/${file}`;
    if (fs.existsSync(path)) {
      pass('Schema exists', file);
    } else {
      warn('Schema exists', `${file} NOT FOUND`);
    }
  }

  // Check migrations
  const migrationsDir = 'apps/backend/prisma/migrations';
  if (fs.existsSync(migrationsDir)) {
    const migrations = fs.readdirSync(migrationsDir).filter(f =>
      fs.statSync(`${migrationsDir}/${f}`).isDirectory()
    );
    pass('Migrations', `${migrations.length} migrations found`);
  } else {
    fail('Migrations', 'Directory not found');
  }
}

// ============================================================================
// CHECK 2: Tenant Isolation
// ============================================================================

async function checkTenantIsolation() {
  console.log(`\n${BOLD}━━━ CHECK 2: Tenant Isolation ━━━${RESET}\n`);

  // TenantResolverMiddleware
  const tenantResolverPath = 'apps/backend/src/common/tenant/tenant-resolver.middleware.ts';
  if (fs.existsSync(tenantResolverPath)) {
    const content = fs.readFileSync(tenantResolverPath, 'utf-8');
    pass('TenantResolverMiddleware', 'Exists');
    if (content.includes('organizationId')) {
      pass('organizationId handling', 'Found');
    }
    if (content.includes('TENANT_ENFORCEMENT')) {
      pass('TENANT_ENFORCEMENT config', 'Found');
    }
  } else {
    fail('TenantResolverMiddleware', 'NOT FOUND');
  }

  // Prisma service
  const prismaPath = 'apps/backend/src/infrastructure/database/prisma.service.ts';
  if (fs.existsSync(prismaPath)) {
    const content = fs.readFileSync(prismaPath, 'utf-8');
    pass('PrismaService', 'Exists');
    if (content.includes('$extends') || content.includes('extension')) {
      pass('Prisma tenant extension', 'Found');
    }
    if (content.includes('SCOPED') || content.includes('scoped')) {
      pass('Scoped models', 'Found');
    }
  } else {
    fail('PrismaService', 'NOT FOUND');
  }

  // RLS migration
  const rlsMigrationDir = 'apps/backend/prisma/migrations';
  if (fs.existsSync(rlsMigrationDir)) {
    const dirs = fs.readdirSync(rlsMigrationDir).filter(f =>
      fs.statSync(`${rlsMigrationDir}/${f}`).isDirectory()
    );
    const rlsMigration = dirs.find(d => d.includes('rls'));
    if (rlsMigration) {
      pass('RLS migration', rlsMigration);
      const sqlPath = `${rlsMigrationDir}/${rlsMigration}/migration.sql`;
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        if (sql.includes('FORCE ROW LEVEL SECURITY')) pass('RLS enforced', 'FORCE ROW LEVEL SECURITY');
        if (sql.includes('deqah_app')) pass('deqah_app role', 'Defined');
        if (sql.includes('app_current_org_id')) pass('app_current_org_id function', 'Exists');
      }
    } else {
      warn('RLS migration', 'Not found');
    }
  }
}

// ============================================================================
// CHECK 3: Security Posture
// ============================================================================

async function checkSecurityPosture() {
  console.log(`\n${BOLD}━━━ CHECK 3: Security Posture ━━━${RESET}\n`);

  // Auth module
  const authPath = 'apps/backend/src/modules/identity/';
  if (fs.existsSync(authPath)) {
    const files = fs.readdirSync(authPath);
    if (files.includes('login')) pass('Login handler', 'Exists');
    if (files.includes('otp')) pass('OTP handlers', 'Exists');

    // Check login handler
    const loginPath = `${authPath}/login/login.handler.ts`;
    if (fs.existsSync(loginPath)) {
      const content = fs.readFileSync(loginPath, 'utf-8');
      if (content.includes('rateLimit') || content.includes('RateLimit')) {
        pass('Rate limiting', 'Found');
      } else {
        warn('Rate limiting', 'Not found in login');
      }
      if (content.includes('lockout') || content.includes('Lockout')) {
        pass('Account lockout', 'Found');
      } else {
        warn('Account lockout', 'Not found in login');
      }
    }
  }

  // Moyasar webhook
  const webhookPath = 'apps/backend/src/modules/finance/moyasar-webhook/moyasar-webhook.handler.ts';
  if (fs.existsSync(webhookPath)) {
    const content = fs.readFileSync(webhookPath, 'utf-8');
    pass('MoyasarWebhook', 'Exists');
    if (content.includes('HMAC') || content.includes('hmac')) pass('Webhook HMAC', 'Found');
    if (content.includes('idempotency') || content.includes('Idempotency')) pass('Webhook idempotency', 'Found');
    if (content.includes('AES') || content.includes('decrypt')) pass('Webhook encryption', 'Found');
  } else {
    warn('MoyasarWebhook', 'Not found');
  }

  // Main.ts
  const mainPath = 'apps/backend/src/main.ts';
  if (fs.existsSync(mainPath)) {
    const content = fs.readFileSync(mainPath, 'utf-8');
    if (content.includes('rawBody') || content.includes('raw: true')) {
      pass('Raw body for webhooks', 'Enabled');
    }
  }
}

// ============================================================================
// CHECK 4: Critical Flows
// ============================================================================

async function checkCriticalFlows() {
  console.log(`\n${BOLD}━━━ CHECK 4: Critical Flows ━━━${RESET}\n`);

  const bookingsPath = 'apps/backend/src/modules/bookings/';
  const financePath = 'apps/backend/src/modules/finance/';

  // Bookings handlers
  const bookingHandlers = ['create-booking', 'cancel-booking', 'reschedule-booking'];
  for (const handler of bookingHandlers) {
    const handlerPath = `${bookingsPath}${handler}/${handler}.handler.ts`;
    if (fs.existsSync(handlerPath)) {
      pass(`Booking: ${handler}`, 'Handler exists');
      const content = fs.readFileSync(handlerPath, 'utf-8');
      if (content.includes('transaction') || content.includes('$transaction')) {
        pass(`Booking: ${handler} transactions`, 'Uses transactions');
      } else {
        warn(`Booking: ${handler} transactions`, 'No transactions');
      }
      if (content.includes('conflict') || content.includes('overlap') || content.includes('lock')) {
        pass(`Booking: ${handler} conflict detection`, 'Found');
      } else {
        warn(`Booking: ${handler} conflict detection`, 'Not found');
      }
    } else {
      fail(`Booking: ${handler}`, 'Handler NOT FOUND');
    }
  }

  // Payment handlers
  const paymentHandlers = ['process-payment', 'verify-payment'];
  for (const handler of paymentHandlers) {
    const handlerDir = fs.readdirSync(financePath).find(d => d.startsWith(handler));
    if (handlerDir) {
      pass(`Payment: ${handler}`, `Handler exists: ${handlerDir}`);
    } else {
      fail(`Payment: ${handler}`, 'Handler NOT FOUND');
    }
  }

  // Billing
  const platformPath = 'apps/backend/src/modules/platform/';
  if (fs.existsSync(`${platformPath}billing`)) {
    pass('Billing module', 'Exists');
  }
}

// ============================================================================
// CHECK 5: Data Integrity
// ============================================================================

async function checkDataIntegrity() {
  console.log(`\n${BOLD}━━━ CHECK 5: Data Integrity ━━━${RESET}\n`);

  const schemaDir = 'apps/backend/prisma/schema';

  // Check ActivityLog
  const mainSchema = fs.readFileSync(`${schemaDir}/main.prisma`, 'utf-8');
  if (mainSchema.includes('ActivityLog')) {
    pass('ActivityLog model', 'Exists in main schema');
  } else {
    warn('ActivityLog model', 'Not found in main schema');
  }

  // Check SuperAdminActionLog
  if (mainSchema.includes('SuperAdminActionLog')) {
    pass('SuperAdminActionLog', 'Exists');
  }

  // Check append-only triggers migration
  const migrationsDir = 'apps/backend/prisma/migrations';
  const appendOnlyMigration = fs.readdirSync(migrationsDir).find(d => d.includes('audit_append_only'));
  if (appendOnlyMigration) {
    pass('Append-only triggers migration', appendOnlyMigration);
  } else {
    warn('Append-only triggers migration', 'Not found');
  }

  // Check timestamps in people schema
  const peopleSchema = fs.readFileSync(`${schemaDir}/people.prisma`, 'utf-8');
  if (peopleSchema.includes('createdAt') && peopleSchema.includes('updatedAt')) {
    pass('Timestamp fields', 'Found in people schema');
  }

  // Check booking status log
  const bookingsSchema = fs.readFileSync(`${schemaDir}/bookings.prisma`, 'utf-8');
  if (bookingsSchema.includes('BookingStatusLog') || bookingsSchema.includes('statusLog')) {
    pass('Booking status log', 'Found');
  }
}

// ============================================================================
// CHECK 6: API Documentation
// ============================================================================

async function checkAPIDocumentation() {
  console.log(`\n${BOLD}━━━ CHECK 6: API Documentation ━━━${RESET}\n`);

  const openApiPath = 'apps/backend/openapi.json';
  if (fs.existsSync(openApiPath)) {
    pass('OpenAPI spec', 'Exists');
    const spec = JSON.parse(fs.readFileSync(openApiPath, 'utf-8'));
    const pathCount = Object.keys(spec.paths || {}).length;
    pass('API paths documented', `${pathCount} paths`);
  } else {
    warn('OpenAPI spec', 'NOT found');
  }
}

// ============================================================================
// CHECK 7: Environment
// ============================================================================

async function checkEnvironment() {
  console.log(`\n${BOLD}━━━ CHECK 7: Environment ━━━${RESET}\n`);

  if (fs.existsSync('.env.example')) {
    pass('.env.example', 'Exists');
    const content = fs.readFileSync('.env.example', 'utf-8');
    const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'];
    for (const v of required) {
      if (content.includes(v)) {
        pass(`Env var: ${v}`, 'Documented');
      } else {
        fail(`Env var: ${v}`, 'NOT documented');
      }
    }
  } else {
    fail('.env.example', 'NOT found');
  }

  if (fs.existsSync('docker/docker-compose.yml')) {
    pass('Docker Compose', 'Exists');
  }
}

// ============================================================================
// CHECK 8: Code Quality
// ============================================================================

async function checkCodeQuality() {
  console.log(`\n${BOLD}━━━ CHECK 8: Code Quality ━━━${RESET}\n`);

  if (fs.existsSync('apps/backend/tsconfig.json')) pass('Backend tsconfig', 'Exists');
  if (fs.existsSync('apps/backend/jest.config.ts')) pass('Jest config', 'Exists');
  if (fs.existsSync('apps/backend/.eslintrc.json')) pass('ESLint config', 'Exists');
  if (fs.existsSync('apps/backend/.prettierrc')) pass('Prettier config', 'Exists');
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
    for (const f of results.failed) {
      console.log(`  ${RED}✗${RESET} ${f.check}: ${f.details}`);
    }
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log(`${BOLD}${YELLOW}━━━ WARNINGS ━━━${RESET}\n`);
    for (const w of results.warnings) {
      console.log(`  ${YELLOW}⚠${RESET} ${w.check}: ${w.details}`);
    }
    console.log('');
  }

  console.log(`${BOLD}${'─'.repeat(60)}${RESET}\n`);

  if (results.failed.length === 0) {
    console.log(`${GREEN}${BOLD}✓ READY FOR LAUNCH${RESET}\n`);
  } else {
    console.log(`${RED}${BOLD}✗ NOT READY - ${results.failed.length} failures${RESET}\n`);
  }

  console.log(`Report: ${new Date().toISOString()}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`${BOLD}${BLUE}
╔═══════════════════════════════════════════════════════════════╗
║         DEQAH LAUNCH READINESS CHECKER v2.0                   ║
╚═══════════════════════════════════════════════════════════════╝
${RESET}`);

  console.log(`${BOLD}Starting pre-launch validation...${RESET}\n`);

  await checkSchemaIntegrity();
  await checkTenantIsolation();
  await checkSecurityPosture();
  await checkCriticalFlows();
  await checkDataIntegrity();
  await checkAPIDocumentation();
  await checkEnvironment();
  await checkCodeQuality();

  printSummary();

  if (results.failed.length > 0) process.exit(1);
}

main().catch(console.error);
