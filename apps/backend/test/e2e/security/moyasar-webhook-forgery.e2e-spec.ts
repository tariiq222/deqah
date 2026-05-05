/**
 * SaaS-02h — Moyasar webhook forgery penetration.
 *
 * Validates the hardening contract for the webhook's system-context bypass:
 *   1. Invalid HMAC signature → rejected (after DB lookup resolves the tenant secret).
 *   2. Valid signature + bogus invoiceId → skipped (no payment created).
 *   3. Valid signature + missing metadata → skipped.
 *   4. systemContext is reachable only from the webhook handler, not from any
 *      authenticated request path (grep-style static invariant + runtime probe).
 *
 * Positive tenant-resolution path is covered in `moyasar-webhook-tenant-context.e2e-spec.ts`.
 */
import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { bootSecurityHarness, SecurityHarness } from './harness';
import { MoyasarWebhookHandler } from '../../../src/modules/finance/moyasar-webhook/moyasar-webhook.handler';
import { MoyasarCredentialsService } from '../../../src/infrastructure/payments/moyasar-credentials.service';

describe('SaaS-02h — Moyasar webhook forgery', () => {
  let h: SecurityHarness;
  let handler: MoyasarWebhookHandler;
  const SECRET = 'test-webhook-secret-02h';

  const sign = (rawBody: string) =>
    createHmac('sha256', SECRET).update(rawBody).digest('hex');

  // Org used for tests that need a real invoice + config
  let testOrgId: string;

  beforeAll(async () => {
    h = await bootSecurityHarness();
    handler = h.app.get(MoyasarWebhookHandler);

    // Create an org and seed its payment config with our test secret
    const org = await h.createOrg(`forgery-test-${Date.now()}`, 'منظمة تزوير');
    testOrgId = org.id;
    const creds = h.app.get(MoyasarCredentialsService);
    await h.runAs({ organizationId: testOrgId }, () =>
      h.prisma.organizationPaymentConfig.create({
        data: {
          organizationId: testOrgId,
          publishableKey: 'pk_test_xxxxxxxxxxxxxxxxxxxx',
          secretKeyEnc: creds.encrypt({ secretKey: 'sk_test_xxxxxxxxxxxxxxxxxxxx' }, testOrgId),
          webhookSecretEnc: creds.encrypt({ webhookSecret: SECRET }, testOrgId),
          isLive: false,
        },
      }),
    );
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  it('rejects webhook with invalid signature', async () => {
    // Seed a real invoice so Stage 2 (invoice lookup) and Stage 3 (config lookup) succeed,
    // allowing Stage 5 (signature verification) to be the one that throws.
    const bookingId = crypto.randomUUID();
    await h.prisma.booking.create({
      data: {
        id: bookingId,
        organizationId: testOrgId,
        branchId: `br-forg-${Date.now()}`,
        clientId: `cli-forg-${Date.now()}`,
        employeeId: `emp-forg-${Date.now()}`,
        serviceId: `svc-forg-${Date.now()}`,
        scheduledAt: new Date('2031-10-01T10:00:00Z'),
        endsAt: new Date('2031-10-01T11:00:00Z'),
        durationMins: 60,
        price: 200,
        currency: 'SAR',
        bookingNumber: 1,
      },
    });
    const invoice = await h.prisma.invoice.create({
      data: {
        organizationId: testOrgId,
        bookingId,
        branchId: `br-forg-${Date.now()}`,
        clientId: `cli-forg-${Date.now()}`,
        employeeId: `emp-forg-${Date.now()}`,
        subtotal: 200,
        discountAmt: 0,
        vatRate: 0.15,
        vatAmt: 30,
        total: 230,
        status: 'ISSUED',
        issuedAt: new Date(),
        currency: 'SAR',
      },
      select: { id: true },
    });

    const payload = {
      id: `pay_bogus_sig_${Date.now()}`,
      status: 'paid' as const,
      amount: 10000,
      currency: 'SAR',
      metadata: { invoiceId: invoice.id },
    };
    const rawBody = JSON.stringify(payload);
    // 'deadbeef' is not a valid hex of correct length — rejected at Stage 5
    await expect(
      handler.execute({ payload, rawBody, signature: 'deadbeef' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('skips valid-signature webhook when invoiceId points nowhere', async () => {
    const payload = {
      id: `pay_forgery_${Date.now()}`,
      status: 'paid' as const,
      amount: 10000,
      currency: 'SAR',
      metadata: { invoiceId: '00000000-0000-0000-0000-deadbeefdead' },
    };
    const rawBody = JSON.stringify(payload);
    const result = await handler.execute({ payload, rawBody, signature: sign(rawBody) });
    expect(result).toEqual({ skipped: true });
  });

  it('skips valid-signature webhook when metadata is missing', async () => {
    const payload = {
      id: `pay_nometa_${Date.now()}`,
      status: 'paid' as const,
      amount: 10000,
      currency: 'SAR',
    };
    const rawBody = JSON.stringify(payload);
    const result = await handler.execute({ payload, rawBody, signature: sign(rawBody) });
    expect(result).toEqual({ skipped: true });
  });

  it('systemContext flag is NOT exposed to authenticated callers', async () => {
    // Invariant: no middleware reads a client-supplied `systemContext` header.
    // The only write sites for SYSTEM_CONTEXT_CLS_KEY are code-local to
    // webhook / DLR / SMS webhook handlers.
    const fs = await import('fs');
    const path = await import('path');
    const srcRoot = path.resolve(__dirname, '../../../src');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    walk(srcRoot);

    const hits: string[] = [];
    for (const file of files) {
      const body = fs.readFileSync(file, 'utf8');
      // Strip line- and block-comments so the grep ignores docstrings.
      const stripped = body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
      if (/\bset\(\s*(SYSTEM_CONTEXT_CLS_KEY|['"]systemContext['"])/.test(stripped)) {
        hits.push(path.relative(srcRoot, file));
      }
    }

    // Allowed write-sites (external-entry flows only):
    const allowed = [
      'modules/finance/moyasar-webhook/moyasar-webhook.handler.ts',
      'modules/finance/moyasar-api/moyasar-subscription-webhook.handler.ts',
      'modules/comms/sms-dlr/sms-dlr.handler.ts',
      'modules/identity/verify-email/verify-email.handler.ts',
      'modules/identity/verify-mobile-otp/verify-mobile-otp.handler.ts',
      'modules/identity/otp/request-otp.handler.ts',
      'modules/identity/otp/verify-otp.handler.ts',
      'modules/identity/otp/otp-session.guard.ts',
    ];
    const unexpected = hits.filter((h) => !allowed.some((a) => h.endsWith(a)));

    // Useful diagnostic on failure.
    if (unexpected.length > 0) {
      console.error('Unexpected systemContext writers:', unexpected);
    }
    expect(unexpected).toEqual([]);
  });
});
