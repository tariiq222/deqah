#!/usr/bin/env node
/**
 * Deqah Error Detection System
 *
 * Detects potential errors in critical flows before production:
 * - Auth flow errors
 * - Booking flow errors
 * - Payment flow errors
 * - Tenant isolation leaks
 * - Data corruption patterns
 *
 * Usage: node scripts/error-detection/index.js [--flow=auth|bookings|payments|all]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';

const args = process.argv.slice(2);
const flowArg = args.find(a => a.startsWith('--flow='))?.split('=')[1] || 'all';

const results = {
  critical: [],
  errors: [],
  warnings: [],
};

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

  const fs = await import('fs');
  const authPath = 'apps/backend/src/modules/identity/';

  // 1. Check login handler for race conditions
  const loginPath = `${authPath}login/login.handler.ts`;
  if (fs.existsSync(loginPath)) {
    const content = fs.readFileSync(loginPath, 'utf-8');

    // Missing rate limiting (check for Redis-based rate limiting too)
    if (!content.includes('rateLimit') && !content.includes('RateLimit') &&
        !content.includes('redisClient.incr') && !content.includes('MAX_EMAIL_RATE_LIMIT')) {
      critical('AUTH_RACE_CONDITION', 'No rate limiting on login endpoint', loginPath);
    }

    // Missing account lockout (check for lockedUntil field too)
    if (!content.includes('lockout') && !content.includes('Lockout') &&
        !content.includes('lockedUntil') && !content.includes('MAX_FAILED_ATTEMPTS')) {
      critical('AUTH_BRUTE_FORCE', 'No account lockout mechanism', loginPath);
    }

    // Missing constant-time password comparison
    if (!content.includes('timingSafeEqual') && !content.includes('crypto')) {
      warn('AUTH_TIMING_ATTACK', 'Password comparison may be vulnerable to timing attacks', loginPath);
    }

    // Check for proper error messages (no info leakage)
    if (content.includes('invalid password') || content.includes('incorrect password')) {
      warn('AUTH_INFO_LEAK', 'Specific password error message may leak info', loginPath);
    }

    // Check for JWT secret validation (or TokenService)
    if (!content.includes('jwt') && !content.includes('JWT') &&
        !content.includes('TokenService') && !content.includes('issueTokenPair')) {
      error('AUTH_NO_JWT', 'No JWT handling found', loginPath);
    }
  } else {
    critical('AUTH_HANDLER_MISSING', 'Login handler not found', loginPath);
  }

  // 2. Check OTP flow
  const otpPath = `${authPath}otp/verify-otp.handler.ts`;
  if (fs.existsSync(otpPath)) {
    const content = fs.readFileSync(otpPath, 'utf-8');

    // Missing brute force protection
    if (!content.includes('attempt') && !content.includes('maxAttempts') &&
        !content.includes('MAX_OTP_ATTEMPTS')) {
      critical('OTP_BRUTE_FORCE', 'No OTP attempt limiting', otpPath);
    }

    // Check for constant-time OTP comparison
    if (!content.includes('timingSafeEqual') && !content.includes('crypto')) {
      warn('OTP_TIMING_ATTACK', 'OTP comparison may be vulnerable', otpPath);
    }

    // Check for OTP expiration
    if (!content.includes('expiresAt') && !content.includes('expir')) {
      warn('OTP_NO_EXPIRY', 'OTP may not expire', otpPath);
    }

    // Check for OTP single-use
    if (!content.includes('used') && !content.includes('UsedOtp')) {
      warn('OTP_REUSE', 'OTP may be reusable', otpPath);
    }
  }

  // 3. Check token service
  const tokenPath = `${authPath}shared/token.service.ts`;
  if (fs.existsSync(tokenPath)) {
    const content = fs.readFileSync(tokenPath, 'utf-8');

    // Check for organizationId in JWT
    if (!content.includes('organizationId') && !content.includes('organization_id')) {
      critical('TOKEN_NO_TENANT', 'JWT does not include organizationId', tokenPath);
    }

    // Check for token expiration
    if (!content.includes('expiresIn') && !content.includes('expir')) {
      critical('TOKEN_NO_EXPIRY', 'Token may not expire', tokenPath);
    }

    // Check for refresh token rotation
    if (!content.includes('refresh') && !content.includes('RefreshToken')) {
      warn('TOKEN_NO_REFRESH', 'No refresh token mechanism', tokenPath);
    }
  } else {
    critical('TOKEN_SERVICE_MISSING', 'Token service not found', tokenPath);
  }

  // 4. Check middleware
  const middlewarePath = 'apps/backend/src/common/tenant/tenant-resolver.middleware.ts';
  if (fs.existsSync(middlewarePath)) {
    const content = fs.readFileSync(middlewarePath, 'utf-8');

    // Check for strict mode enforcement
    if (!content.includes('strict') && !content.includes('enforcement')) {
      warn('MIDDLEWARE_NO_STRICT', 'No strict enforcement mode', middlewarePath);
    }

    // Check for proper error on missing tenant
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

  const fs = await import('fs');
  const bookingsPath = 'apps/backend/src/modules/bookings/';

  // 1. Check create booking
  const createPath = `${bookingsPath}create-booking/create-booking.handler.ts`;
  if (fs.existsSync(createPath)) {
    const content = fs.readFileSync(createPath, 'utf-8');

    // Missing transaction
    if (!content.includes('$transaction') && !content.includes('transaction')) {
      critical('BOOKING_NO_TRANSACTION', 'Booking creation not in transaction', createPath);
    }

    // Missing conflict detection
    if (!content.includes('overlap') && !content.includes('conflict') && !content.includes('lock')) {
      critical('BOOKING_NO_CONFLICT_CHECK', 'No double-booking prevention', createPath);
    }

    // Missing group session lock
    if (content.includes('group') && !content.includes('pg_advisory_xact_lock')) {
      warn('BOOKING_GROUP_RACE', 'Group session may have race condition', createPath);
    }

    // Check for plan limit enforcement
    if (!content.includes('maxBookings') && !content.includes('limit')) {
      warn('BOOKING_NO_PLAN_LIMIT', 'May not enforce plan booking limits', createPath);
    }

    // Check for VAT calculation
    if (!content.includes('vat') && !content.includes('VAT') && !content.includes('tax')) {
      warn('BOOKING_NO_VAT', 'May not calculate VAT', createPath);
    }

    // Check for coupon validation
    if (!content.includes('coupon') && !content.includes('Coupon')) {
      warn('BOOKING_NO_COUPON', 'May not validate coupons', createPath);
    }
  } else {
    critical('BOOKING_HANDLER_MISSING', 'Create booking handler not found', createPath);
  }

  // 2. Check cancel booking
  const cancelPath = `${bookingsPath}cancel-booking/cancel-booking.handler.ts`;
  if (fs.existsSync(cancelPath)) {
    const content = fs.readFileSync(cancelPath, 'utf-8');

    // Check for refund logic
    if (!content.includes('refund') && !content.includes('Refund')) {
      warn('CANCEL_NO_REFUND', 'May not handle refunds', cancelPath);
    }

    // Check for cancellation window
    if (!content.includes('cancelWindow') && !content.includes('freeCancel')) {
      warn('CANCEL_NO_WINDOW', 'May not enforce cancellation window', cancelPath);
    }

    // Check for coupon usage restoration
    if (content.includes('coupon') && !content.includes('restore') && !content.includes('return')) {
      warn('CANCEL_COUPON_LEAK', 'Coupon usage may not be restored on cancel', cancelPath);
    }
  }

  // 3. Check reschedule booking
  const reschedulePath = `${bookingsPath}reschedule-booking/reschedule-booking.handler.ts`;
  if (fs.existsSync(reschedulePath)) {
    const content = fs.readFileSync(reschedulePath, 'utf-8');

    // Check for max reschedules limit
    if (!content.includes('maxReschedul') && !content.includes('rescheduleLimit')) {
      warn('RESCHEDULE_NO_LIMIT', 'May not limit number of reschedules', reschedulePath);
    }

    // Check for conflict detection
    if (!content.includes('conflict') && !content.includes('overlap')) {
      critical('RESCHEDULE_NO_CONFLICT', 'No conflict detection for reschedule', reschedulePath);
    }

    // Check for Zoom update
    if (content.includes('zoom') && !content.includes('update') && !content.includes('Zoom')) {
      warn('RESCHEDULE_NO_ZOOM_UPDATE', 'May not update Zoom meeting on reschedule', reschedulePath);
    }
  }

  // 4. Check booking status log
  const statusLogPath = `${bookingsPath}status-log/`;
  if (fs.existsSync(statusLogPath)) {
    const files = fs.readdirSync(statusLogPath).filter(f => f.endsWith('.ts'));
    if (files.length === 0) {
      warn('BOOKING_NO_STATUS_LOG', 'No status log handlers found', statusLogPath);
    } else {
      // Check for event publishing
      const hasEvents = files.some(f => fs.readFileSync(`${statusLogPath}${f}`, 'utf-8').includes('publish') || fs.readFileSync(`${statusLogPath}${f}`, 'utf-8').includes('event'));
      if (!hasEvents) {
        warn('BOOKING_NO_EVENTS', 'Status changes may not publish events', statusLogPath);
      }
    }
  }

  // 5. Check waitlist
  const waitlistPath = `${bookingsPath}add-to-waitlist/add-to-waitlist.handler.ts`;
  if (fs.existsSync(waitlistPath)) {
    const content = fs.readFileSync(waitlistPath, 'utf-8');

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

  const fs = await import('fs');
  const financePath = 'apps/backend/src/modules/finance/';

  // 1. Check Moyasar webhook
  const webhookPath = `${financePath}moyasar-webhook/moyasar-webhook.handler.ts`;
  if (fs.existsSync(webhookPath)) {
    const content = fs.readFileSync(webhookPath, 'utf-8');

    // Missing signature verification
    if (!content.includes('verify') && !content.includes('HMAC') && !content.includes('hmac')) {
      critical('WEBHOOK_NO_VERIFY', 'No webhook signature verification', webhookPath);
    }

    // Missing idempotency check
    if (!content.includes('idempotency') && !content.includes('Idempotency')) {
      critical('WEBHOOK_NO_IDEMPOTENCY', 'Webhook may process same event twice', webhookPath);
    }

    // Missing amount validation
    if (!content.includes('amount') && !content.includes('validate')) {
      critical('WEBHOOK_AMOUNT_SPOOF', 'No amount validation against invoice', webhookPath);
    }

    // Missing tenant resolution BEFORE verification
    const tenantBeforeVerify = content.indexOf('organizationId') < content.indexOf('verify');
    if (tenantBeforeVerify === false && content.includes('verify')) {
      // If we can't determine order, just warn
      warn('WEBHOOK_TENANT_ORDER', 'May verify signature before resolving tenant', webhookPath);
    }

    // Missing currency validation
    if (!content.includes('currency') && !content.includes('SAR')) {
      warn('WEBHOOK_NO_CURRENCY', 'May not validate currency', webhookPath);
    }
  } else {
    critical('WEBHOOK_HANDLER_MISSING', 'Moyasar webhook handler not found', webhookPath);
  }

  // 2. Check payment processing
  const paymentPath = `${financePath}process-payment/process-payment.handler.ts`;
  if (fs.existsSync(paymentPath)) {
    const content = fs.readFileSync(paymentPath, 'utf-8');

    // Missing idempotency
    if (!content.includes('idempotency') && !content.includes('IdempotencyKey')) {
      critical('PAYMENT_NO_IDEMPOTENCY', 'Payment may be processed twice', paymentPath);
    }

    // Missing invoice status update
    if (!content.includes('invoice') && !content.includes('Invoice')) {
      critical('PAYMENT_NO_INVOICE', 'Payment may not update invoice status', paymentPath);
    }

    // Missing partial payment handling
    if (!content.includes('partial') && !content.includes('remaining')) {
      warn('PAYMENT_NO_PARTIAL', 'May not handle partial payments', paymentPath);
    }
  }

  // 3. Check refund handling
  const refundPath = `${financePath}refund-request/refund-request.handler.ts`;
  if (fs.existsSync(refundPath)) {
    const content = fs.readFileSync(refundPath, 'utf-8');

    // Check for refund limit validation
    if (!content.includes('maxRefund') && !content.includes('refundLimit')) {
      warn('REFUND_NO_LIMIT', 'May not enforce refund limits', refundPath);
    }

    // Check for idempotency
    if (!content.includes('idempotency') && !content.includes('already')) {
      warn('REFUND_NO_IDEMPOTENCY', 'Refund request may be duplicated', refundPath);
    }
  }

  // 4. Check coupon validation
  const couponPath = `${financePath}coupon/validate-coupon/validate-coupon.handler.ts`;
  if (fs.existsSync(couponPath)) {
    const content = fs.readFileSync(couponPath, 'utf-8');

    // Check for strict mode
    if (!content.includes('strict') && !content.includes('transaction')) {
      warn('COUPON_NO_STRICT', 'Coupon validation may not be strict', couponPath);
    }

    // Check for usage limits
    if (!content.includes('maxUsage') && !content.includes('usageLimit')) {
      warn('COUPON_NO_LIMIT', 'May not enforce coupon usage limits', couponPath);
    }
  }
}

// ============================================================================
// TENANT ISOLATION ERRORS
// ============================================================================

async function detectTenantIsolationErrors() {
  console.log(`\n${BOLD}━━━ TENANT ISOLATION ERROR DETECTION ━━━${RESET}\n`);

  const fs = await import('fs');

  // 1. Check Prisma service
  const prismaPath = 'apps/backend/src/infrastructure/database/prisma.service.ts';
  if (fs.existsSync(prismaPath)) {
    const content = fs.readFileSync(prismaPath, 'utf-8');

    // Missing tenant extension
    if (!content.includes('$extends') && !content.includes('extension')) {
      critical('RLS_NO_EXTENSION', 'No Prisma tenant extension', prismaPath);
    }

    // Missing scoped models
    if (!content.includes('scoped') && !content.includes('SCOPED')) {
      critical('RLS_NO_SCOPED_MODELS', 'No scoped models defined', prismaPath);
    }

    // Missing organizationId injection
    if (!content.includes('organizationId') && !content.includes('where')) {
      critical('RLS_NO_ORG_INJECTION', 'organizationId not injected in queries', prismaPath);
    }
  } else {
    critical('PRISMA_SERVICE_MISSING', 'Prisma service not found', prismaPath);
  }

  // 2. Check for cross-tenant references
  const schemasPath = 'apps/backend/prisma/schema/';
  const schemas = fs.readdirSync(schemasPath).filter(f => f.endsWith('.prisma'));

  for (const schema of schemas) {
    const content = fs.readFileSync(`${schemasPath}${schema}`, 'utf-8');

    // Check for plain string IDs without relations (cross-BC)
    const plainIdMatches = content.match(/String\s+\?\s+@default\(uuid\(\)\)/g);
    if (plainIdMatches && plainIdMatches.length > 5) {
      warn('SCHEMA_PLAIN_IDS', `Many plain UUID fields - cross-BC refs may lack integrity checks`, schema);
    }
  }

  // 3. Check RLS policies
  const rlsMigration = 'apps/backend/prisma/migrations/20260509000000_rls_app_role_and_strict_policies/migration.sql';
  if (fs.existsSync(rlsMigration)) {
    const content = fs.readFileSync(rlsMigration, 'utf-8');

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

  const fs = await import('fs');

  // 1. Check for missing indexes
  const schemasPath = 'apps/backend/prisma/schema/';

  const importantIndexes = [
    { schema: 'bookings.prisma', field: 'organizationId', table: 'Booking' },
    { schema: 'bookings.prisma', field: 'clientId', table: 'Booking' },
    { schema: 'bookings.prisma', field: 'status', table: 'Booking' },
    { schema: 'finance.prisma', field: 'organizationId', table: 'Invoice' },
    { schema: 'finance.prisma', field: 'organizationId', table: 'Payment' },
    { schema: 'identity.prisma', field: 'organizationId', table: 'User' },
  ];

  for (const idx of importantIndexes) {
    const schemaPath = `${schemasPath}${idx.schema}`;
    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, 'utf-8');

      // Check if field exists
      if (content.includes(idx.field)) {
        // Check if it's indexed
        const modelMatch = content.match(new RegExp(`model\\s+${idx.table}\\s+{[^}]+}`));
        if (modelMatch) {
          const modelContent = modelMatch[0];
          const fieldMatch = modelContent.match(new RegExp(`@id|@@id|@@index|@index`));
          if (!fieldMatch || !modelContent.includes(`@@index`)) {
            warn('NO_INDEX', `Missing index on ${idx.table}.${idx.field}`, idx.schema);
          }
        }
      }
    }
  }

  // 2. Check for missing unique constraints
  const uniqueChecks = [
    { schema: 'identity.prisma', field: 'email', model: 'User' },
    { schema: 'finance.prisma', field: 'idempotencyKey', model: 'Payment' },
  ];

  for (const uc of uniqueChecks) {
    const schemaPath = `${schemasPath}${uc.schema}`;
    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, 'utf-8');
      if (!content.includes('@unique') && !content.includes('@@unique')) {
        warn('NO_UNIQUE_CONSTRAINT', `${uc.model}.${uc.field} may need unique constraint`, uc.schema);
      }
    }
  }

  // 3. Check for missing required fields
  const requiredFields = [
    { schema: 'bookings.prisma', model: 'Booking', field: 'status' },
    { schema: 'finance.prisma', model: 'Invoice', field: 'total' },
    { schema: 'finance.prisma', model: 'Payment', field: 'amount' },
  ];

  for (const rf of requiredFields) {
    const schemaPath = `${schemasPath}${rf.schema}`;
    if (fs.existsSync(schemaPath)) {
      const content = fs.readFileSync(schemaPath, 'utf-8');
      const modelMatch = content.match(new RegExp(`model\\s+${rf.model}\\s+{[^}]+}`));
      if (modelMatch) {
        const modelContent = modelMatch[0];
        // Check if field is optional (String? or Int? etc)
        const fieldMatch = modelContent.match(new RegExp(`${rf.field}\\s+\\w+\\?`));
        if (fieldMatch) {
          warn('OPTIONAL_REQUIRED_FIELD', `${rf.model}.${rf.field} is optional but should be required`, rf.schema);
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
    for (const c of results.critical) {
      console.log(`  ${RED}✗${RESET} ${BOLD}${c.check}:${RESET} ${c.details}`);
      if (c.location) console.log(`    ${RED}@ ${c.location}${RESET}`);
    }
    console.log('');
  }

  if (results.errors.length > 0) {
    console.log(`${BOLD}${RED}━━━ ERRORS ━━━${RESET}\n`);
    for (const e of results.errors) {
      console.log(`  ${RED}✗${RESET} ${BOLD}${e.check}:${RESET} ${e.details}`);
      if (e.location) console.log(`    ${RED}@ ${e.location}${RESET}`);
    }
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log(`${BOLD}${YELLOW}━━━ WARNINGS ━━━${RESET}\n`);
    for (const w of results.warnings) {
      console.log(`  ${YELLOW}⚠${RESET} ${BOLD}${w.check}:${RESET} ${w.details}`);
      if (w.location) console.log(`    ${YELLOW}@ ${w.location}${RESET}`);
    }
    console.log('');
  }

  // Verdict
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

async function main() {
  console.log(`${BOLD}${BLUE}
╔═══════════════════════════════════════════════════════════════╗
║         DEQAH ERROR DETECTION SYSTEM v1.0                   ║
╚═══════════════════════════════════════════════════════════════╝
${RESET}`);

  console.log(`${BOLD}Scanning for potential errors in critical flows...${RESET}\n`);

  if (flowArg === 'all' || flowArg === 'auth') {
    await detectAuthErrors();
  }

  if (flowArg === 'all' || flowArg === 'bookings') {
    await detectBookingErrors();
  }

  if (flowArg === 'all' || flowArg === 'payments') {
    await detectPaymentErrors();
  }

  if (flowArg === 'all' || flowArg === 'tenant') {
    await detectTenantIsolationErrors();
  }

  if (flowArg === 'all') {
    await detectDataCorruption();
  }

  printSummary();

  if (results.critical.length > 0 || results.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
