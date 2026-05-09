/**
 * Deqah Error Detection System
 *
 * Part of Runtime Orchestration System
 * Detects potential errors in critical flows.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';

const results = { critical: [], errors: [], warnings: [] };

function log(category, message, severity = 'INFO') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const color = severity === 'CRITICAL' ? RED : severity === 'ERROR' ? RED : severity === 'WARN' ? YELLOW : BLUE;
  console.log(`${BLUE}[${timestamp}]${RESET} ${color}[${severity}]${RESET} ${BOLD}${category}:${RESET} ${message}`);
}

function critical(check, details, location = '') {
  results.critical.push({ check, details, location });
  log(check, `${details}${location ? ` (${location})` : ''}`, 'CRITICAL');
}

function error(check, details, location = '') {
  results.errors.push({ check, details, location });
  log(check, `${details}${location ? ` (${location})` : ''}`, 'ERROR');
}

function warn(check, details, location = '') {
  results.warnings.push({ check, details, location });
  log(check, `${details}${location ? ` (${location})` : ''}`, 'WARN');
}

// ============================================================================
// AUTH FLOW ERRORS
// ============================================================================

async function detectAuthErrors() {
  console.log(`\n${BOLD}━━━ AUTH FLOW ERROR DETECTION ━━━${RESET}\n`);

  const authPath = 'apps/backend/src/modules/identity/';

  // Login handler
  const loginPath = `${authPath}login/login.handler.ts`;
  if (existsSync(loginPath)) {
    const content = readFileSync(loginPath, 'utf-8');

    // Rate limiting
    if (!content.includes('rateLimit') && !content.includes('RateLimit') &&
        !content.includes('redisClient.incr') && !content.includes('MAX_EMAIL_RATE_LIMIT')) {
      critical('AUTH_RACE_CONDITION', 'No rate limiting on login endpoint', loginPath);
    }

    // Account lockout
    if (!content.includes('lockout') && !content.includes('Lockout') &&
        !content.includes('lockedUntil') && !content.includes('MAX_FAILED_ATTEMPTS')) {
      critical('AUTH_BRUTE_FORCE', 'No account lockout mechanism', loginPath);
    }

    // Timing attack
    if (!content.includes('timingSafeEqual') && !content.includes('crypto')) {
      warn('AUTH_TIMING_ATTACK', 'Password comparison may be vulnerable to timing attacks', loginPath);
    }

    // JWT handling
    if (!content.includes('jwt') && !content.includes('JWT') &&
        !content.includes('TokenService') && !content.includes('issueTokenPair')) {
      error('AUTH_NO_JWT', 'No JWT handling found', loginPath);
    }
  } else {
    critical('AUTH_HANDLER_MISSING', 'Login handler not found', loginPath);
  }

  // OTP handler
  const otpPath = `${authPath}otp/verify-otp.handler.ts`;
  if (existsSync(otpPath)) {
    const content = readFileSync(otpPath, 'utf-8');

    if (!content.includes('attempt') && !content.includes('maxAttempts') &&
        !content.includes('MAX_OTP_ATTEMPTS')) {
      critical('OTP_BRUTE_FORCE', 'No OTP attempt limiting', otpPath);
    }

    if (!content.includes('timingSafeEqual') && !content.includes('crypto')) {
      warn('OTP_TIMING_ATTACK', 'OTP comparison may be vulnerable', otpPath);
    }

    if (!content.includes('used') && !content.includes('UsedOtp')) {
      warn('OTP_REUSE', 'OTP may be reusable', otpPath);
    }
  }

  // Token service
  const tokenPath = `${authPath}shared/token.service.ts`;
  if (existsSync(tokenPath)) {
    const content = readFileSync(tokenPath, 'utf-8');

    if (!content.includes('organizationId') && !content.includes('organization_id')) {
      critical('TOKEN_NO_TENANT', 'JWT does not include organizationId', tokenPath);
    }

    if (!content.includes('expiresIn') && !content.includes('expir')) {
      critical('TOKEN_NO_EXPIRY', 'Token may not expire', tokenPath);
    }

    if (!content.includes('refresh') && !content.includes('RefreshToken')) {
      warn('TOKEN_NO_REFRESH', 'No refresh token mechanism', tokenPath);
    }
  }

  // Middleware
  const middlewarePath = 'apps/backend/src/common/tenant/tenant-resolver.middleware.ts';
  if (existsSync(middlewarePath)) {
    const content = readFileSync(middlewarePath, 'utf-8');

    if (!content.includes('Unauthorized') && !content.includes('403')) {
      warn('MIDDLEWARE_NO_ERROR', 'May not return proper error on missing tenant', middlewarePath);
    }
  }
}

// ============================================================================
// BOOKING FLOW ERRORS
// ============================================================================

async function detectBookingErrors() {
  console.log(`\n${BOLD}━━━ BOOKING FLOW ERROR DETECTION ━━━${RESET}\n`);

  const bookingsPath = 'apps/backend/src/modules/bookings/';

  // Create booking
  const createPath = `${bookingsPath}create-booking/create-booking.handler.ts`;
  if (existsSync(createPath)) {
    const content = readFileSync(createPath, 'utf-8');

    if (!content.includes('$transaction') && !content.includes('transaction')) {
      critical('BOOKING_NO_TRANSACTION', 'Booking creation not in transaction', createPath);
    }

    if (!content.includes('overlap') && !content.includes('conflict') && !content.includes('lock')) {
      critical('BOOKING_NO_CONFLICT_CHECK', 'No double-booking prevention', createPath);
    }

    if (content.includes('group') && !content.includes('pg_advisory_xact_lock')) {
      warn('BOOKING_GROUP_RACE', 'Group session may have race condition', createPath);
    }

    if (!content.includes('maxBookings') && !content.includes('limit')) {
      warn('BOOKING_NO_PLAN_LIMIT', 'May not enforce plan booking limits', createPath);
    }
  } else {
    critical('BOOKING_HANDLER_MISSING', 'Create booking handler not found', createPath);
  }

  // Cancel booking
  const cancelPath = `${bookingsPath}cancel-booking/cancel-booking.handler.ts`;
  if (existsSync(cancelPath)) {
    const content = readFileSync(cancelPath, 'utf-8');

    if (!content.includes('refund') && !content.includes('Refund')) {
      warn('CANCEL_NO_REFUND', 'May not handle refunds', cancelPath);
    }

    if (!content.includes('cancelWindow') && !content.includes('freeCancel')) {
      warn('CANCEL_NO_WINDOW', 'May not enforce cancellation window', cancelPath);
    }
  }

  // Reschedule booking
  const reschedulePath = `${bookingsPath}reschedule-booking/reschedule-booking.handler.ts`;
  if (existsSync(reschedulePath)) {
    const content = readFileSync(reschedulePath, 'utf-8');

    if (!content.includes('conflict') && !content.includes('overlap')) {
      critical('RESCHEDULE_NO_CONFLICT', 'No conflict detection for reschedule', reschedulePath);
    }
  }

  // Waitlist
  const waitlistPath = `${bookingsPath}add-to-waitlist/add-to-waitlist.handler.ts`;
  if (existsSync(waitlistPath)) {
    const content = readFileSync(waitlistPath, 'utf-8');

    if (!content.includes('notification') && !content.includes('notify')) {
      warn('WAITLIST_NO_NOTIFY', 'Waitlist may not notify when slot opens', waitlistPath);
    }
  }
}

// ============================================================================
// PAYMENT FLOW ERRORS
// ============================================================================

async function detectPaymentErrors() {
  console.log(`\n${BOLD}━━━ PAYMENT FLOW ERROR DETECTION ━━━${RESET}\n`);

  const financePath = 'apps/backend/src/modules/finance/';

  // Moyasar webhook
  const webhookPath = `${financePath}moyasar-webhook/moyasar-webhook.handler.ts`;
  if (existsSync(webhookPath)) {
    const content = readFileSync(webhookPath, 'utf-8');

    if (!content.includes('verify') && !content.includes('HMAC') && !content.includes('hmac')) {
      critical('WEBHOOK_NO_VERIFY', 'No webhook signature verification', webhookPath);
    }

    if (!content.includes('idempotency') && !content.includes('Idempotency')) {
      critical('WEBHOOK_NO_IDEMPOTENCY', 'Webhook may process same event twice', webhookPath);
    }

    if (!content.includes('amount') && !content.includes('validate')) {
      critical('WEBHOOK_AMOUNT_SPOOF', 'No amount validation against invoice', webhookPath);
    }

    if (!content.includes('currency') && !content.includes('SAR')) {
      warn('WEBHOOK_NO_CURRENCY', 'May not validate currency', webhookPath);
    }
  } else {
    critical('WEBHOOK_HANDLER_MISSING', 'Moyasar webhook handler not found', webhookPath);
  }

  // Payment processing
  const paymentPath = `${financePath}process-payment/process-payment.handler.ts`;
  if (existsSync(paymentPath)) {
    const content = readFileSync(paymentPath, 'utf-8');

    if (!content.includes('idempotency') && !content.includes('IdempotencyKey')) {
      critical('PAYMENT_NO_IDEMPOTENCY', 'Payment may be processed twice', paymentPath);
    }

    if (!content.includes('partial') && !content.includes('remaining')) {
      warn('PAYMENT_NO_PARTIAL', 'May not handle partial payments', paymentPath);
    }
  }
}

// ============================================================================
// TENANT ISOLATION ERRORS
// ============================================================================

async function detectTenantIsolationErrors() {
  console.log(`\n${BOLD}━━━ TENANT ISOLATION ERROR DETECTION ━━━${RESET}\n`);

  // Prisma service
  const prismaPath = 'apps/backend/src/infrastructure/database/prisma.service.ts';
  if (existsSync(prismaPath)) {
    const content = readFileSync(prismaPath, 'utf-8');

    if (!content.includes('$extends') && !content.includes('extension')) {
      critical('RLS_NO_EXTENSION', 'No Prisma tenant extension', prismaPath);
    }

    if (!content.includes('scoped') && !content.includes('SCOPED')) {
      critical('RLS_NO_SCOPED_MODELS', 'No scoped models defined', prismaPath);
    }

    if (!content.includes('organizationId') && !content.includes('where')) {
      critical('RLS_NO_ORG_INJECTION', 'organizationId not injected in queries', prismaPath);
    }
  } else {
    critical('PRISMA_SERVICE_MISSING', 'Prisma service not found', prismaPath);
  }

  // RLS migration
  const rlsMigration = 'apps/backend/prisma/migrations/20260509000000_rls_app_role_and_strict_policies/migration.sql';
  if (existsSync(rlsMigration)) {
    const content = readFileSync(rlsMigration, 'utf-8');

    if (!content.includes('FORCE ROW LEVEL SECURITY')) {
      critical('RLS_NOT_FORCED', 'RLS not forced on tables', rlsMigration);
    }

    if (!content.includes('deqah_app')) {
      critical('RLS_NO_APP_ROLE', 'deqah_app role not defined', rlsMigration);
    }

    if (!content.includes('NOBYPASSRLS')) {
      warn('RLS_CAN_BYPASS', 'App role may bypass RLS', rlsMigration);
    }
  }
}

// ============================================================================
// DATA CORRUPTION PATTERNS
// ============================================================================

async function detectDataCorruption() {
  console.log(`\n${BOLD}━━━ DATA CORRUPTION PATTERN DETECTION ━━━${RESET}\n`);

  const schemasPath = 'apps/backend/prisma/schema/';

  const importantIndexes = [
    { schema: 'bookings.prisma', field: 'organizationId', table: 'Booking' },
    { schema: 'bookings.prisma', field: 'clientId', table: 'Booking' },
    { schema: 'finance.prisma', field: 'organizationId', table: 'Invoice' },
    { schema: 'finance.prisma', field: 'organizationId', table: 'Payment' },
    { schema: 'identity.prisma', field: 'organizationId', table: 'User' },
  ];

  for (const idx of importantIndexes) {
    const schemaPath = `${schemasPath}${idx.schema}`;
    if (existsSync(schemaPath)) {
      const content = readFileSync(schemaPath, 'utf-8');

      if (content.includes(idx.field)) {
        const modelMatch = content.match(new RegExp(`model\\s+${idx.table}\\s+{[^}]+}`));
        if (modelMatch) {
          const modelContent = modelMatch[0];
          if (!modelContent.includes('@@index')) {
            warn('NO_INDEX', `Missing index on ${idx.table}.${idx.field}`, idx.schema);
          }
        }
      }
    }
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary() {
  console.log(`\n${BOLD}${'═'.repeat(60)}${RESET}\n`);
  console.log(`${BOLD}ERROR DETECTION SUMMARY${RESET}\n`);

  console.log(`${RED}CRITICAL: ${results.critical.length}${RESET}`);
  console.log(`${RED}ERRORS: ${results.errors.length}${RESET}`);
  console.log(`${YELLOW}WARNINGS: ${results.warnings.length}${RESET}\n`);

  if (results.critical.length > 0) {
    console.log(`${BOLD}${RED}━━━ CRITICAL ISSUES ━━━${RESET}\n`);
    results.critical.forEach(c => {
      console.log(`  ${RED}✗${RESET} ${BOLD}${c.check}:${RESET} ${c.details}`);
      c.location && console.log(`    ${RED}@ ${c.location}${RESET}`);
    });
    console.log('');
  }

  if (results.errors.length > 0) {
    console.log(`${BOLD}${RED}━━━ ERRORS ━━━${RESET}\n`);
    results.errors.forEach(e => {
      console.log(`  ${RED}✗${RESET} ${BOLD}${e.check}:${RESET} ${e.details}`);
      e.location && console.log(`    ${RED}@ ${e.location}${RESET}`);
    });
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log(`${BOLD}${YELLOW}━━━ WARNINGS ━━━${RESET}\n`);
    results.warnings.forEach(w => {
      console.log(`  ${YELLOW}⚠${RESET} ${BOLD}${w.check}:${RESET} ${w.details}`);
      w.location && console.log(`    ${YELLOW}@ ${w.location}${RESET}`);
    });
    console.log('');
  }

  console.log(`${BOLD}${'─'.repeat(60)}${RESET}\n`);

  if (results.critical.length > 0) {
    console.log(`${RED}${BOLD}✗ DO NOT LAUNCH${RESET}\n`);
    console.log(`${RED}${results.critical.length} critical issues must be fixed.${RESET}\n`);
  } else if (results.errors.length > 0) {
    console.log(`${YELLOW}${BOLD}⚠ LAUNCH WITH CAUTION${RESET}\n`);
    console.log(`${YELLOW}${results.errors.length} errors should be fixed before launch.${RESET}\n`);
  } else if (results.warnings.length > 0) {
    console.log(`${GREEN}${BOLD}✓ READY FOR LAUNCH (with warnings)${RESET}\n`);
    console.log(`${YELLOW}${results.warnings.length} warnings to review.${RESET}\n`);
  } else {
    console.log(`${GREEN}${BOLD}✓ READY FOR LAUNCH${RESET}\n`);
  }

  console.log(`Report generated: ${new Date().toISOString()}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

export type FlowType = 'auth' | 'bookings' | 'payments' | 'tenant' | 'all';

export async function runErrorDetection(flow: FlowType = 'all') {
  console.log(`${BOLD}${BLUE}
╔═══════════════════════════════════════════════════════════════╗
║         DEQAH ERROR DETECTION SYSTEM (Runtime)              ║
╚═══════════════════════════════════════════════════════════════╝
${RESET}`);

  console.log(`${BOLD}Scanning for potential errors in critical flows...${RESET}\n`);

  if (flow === 'all' || flow === 'auth') await detectAuthErrors();
  if (flow === 'all' || flow === 'bookings') await detectBookingErrors();
  if (flow === 'all' || flow === 'payments') await detectPaymentErrors();
  if (flow === 'all' || flow === 'tenant') await detectTenantIsolationErrors();
  if (flow === 'all') await detectDataCorruption();

  printSummary();

  return {
    critical: results.critical.length,
    errors: results.errors.length,
    warnings: results.warnings.length,
    ready: results.critical.length === 0 && results.errors.length === 0,
  };
}

// CLI
const args = process.argv.slice(2);
const flowArg = args.find(a => a.startsWith('--flow='))?.split('=')[1] as FlowType || 'all';

if (require.main === module) {
  runErrorDetection(flowArg).then(r => process.exit(r.ready ? 0 : 1));
}
