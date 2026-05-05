import { createHmac } from 'crypto';
import { testPrisma, cleanTables } from '../../setup/db.setup';
import { seedEmployee, seedService, seedBranch, seedEmployeeService, seedClient } from '../../setup/seed.helper';
import { MoyasarWebhookHandler } from '../../../src/modules/finance/moyasar-webhook/moyasar-webhook.handler';
import { MoyasarCredentialsService } from '../../../src/infrastructure/payments/moyasar-credentials.service';
import { EventBusService } from '../../../src/infrastructure/events';
import { PaymentStatus } from '@prisma/client';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

const TEST_SECRET = 'webhook-test-secret';

function sign(rawBody: string, secret = TEST_SECRET) {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('Moyasar Webhook — Idempotency (e2e-style)', () => {
  let handler: MoyasarWebhookHandler;
  let invoiceId: string;
  let bookingId: string;
  let clientId: string;
  let employeeId: string;
  let serviceId: string;
  let branchId: string;

  const buildEventBus = () => ({
    publish: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    await cleanTables(['Payment', 'Invoice', 'Booking', 'OtpCode', 'Client', 'Employee', 'Service', 'Branch', 'OrganizationPaymentConfig']);

    const [client, employee, service, branch] = await Promise.all([
      seedClient(testPrisma as never),
      seedEmployee(testPrisma as never),
      seedService(testPrisma as never, { durationMins: 60, price: 200 }),
      seedBranch(testPrisma as never),
    ]);
    clientId = client.id;
    employeeId = employee.id;
    serviceId = service.id;
    branchId = branch.id;

    const booking = await testPrisma.booking.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        clientId,
        employeeId,
        serviceId,
        branchId,
        scheduledAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        durationMins: 60,
        price: 200,
        currency: 'SAR',
        status: 'CONFIRMED',
        bookingType: 'INDIVIDUAL',
        bookingNumber: Date.now(),
      },
    });
    bookingId = booking.id;

    const invoice = await testPrisma.invoice.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        branchId,
        clientId,
        employeeId,
        bookingId,
        subtotal: 200,
        discountAmt: 0,
        vatRate: 0.15,
        vatAmt: 30,
        total: 230,
        status: 'ISSUED',
        issuedAt: new Date(),
      },
    });
    invoiceId = invoice.id;

    // Seed per-tenant payment config with the test webhook secret.
    // MoyasarCredentialsService requires the encryption key from env — the
    // isolation-harness sets MOYASAR_TENANT_ENCRYPTION_KEY so we can use it directly.
    const encKey = process.env.MOYASAR_TENANT_ENCRYPTION_KEY ?? Buffer.alloc(32, 3).toString('base64');
    const { ConfigService } = await import('@nestjs/config');
    const cfg = { get: (k: string) => (k === 'MOYASAR_TENANT_ENCRYPTION_KEY' ? encKey : undefined) } as InstanceType<typeof ConfigService>;
    const creds = new MoyasarCredentialsService(cfg);

    await testPrisma.organizationPaymentConfig.upsert({
      where: { organizationId: DEFAULT_ORG_ID },
      update: { webhookSecretEnc: creds.encrypt({ webhookSecret: TEST_SECRET }, DEFAULT_ORG_ID) },
      create: {
        organizationId: DEFAULT_ORG_ID,
        publishableKey: 'pk_test_xxxxxxxxxxxxxxxxxxxx',
        secretKeyEnc: creds.encrypt({ secretKey: 'sk_test_xxxxxxxxxxxxxxxxxxxx' }, DEFAULT_ORG_ID),
        webhookSecretEnc: creds.encrypt({ webhookSecret: TEST_SECRET }, DEFAULT_ORG_ID),
        isLive: false,
      },
    });

    // Minimal ClsService stub: `run` executes callback; `set`/`get` track local
    // storage so the handler's SaaS-02e 3-stage flow (system-context bypass
    // then tenant context) works in the raw e2e harness.
    const clsStore: Record<string, unknown> = {};
    const cls = {
      run: async (fn: () => Promise<unknown>) => fn(),
      set: (key: string, value: unknown) => {
        clsStore[key] = value;
      },
      get: (key: string) => clsStore[key],
    };
    handler = new MoyasarWebhookHandler(
      testPrisma as never,
      buildEventBus() as never,
      cls as never,
      creds as never,
    );
  });

  afterAll(async () => {
    await cleanTables(['Payment', 'Invoice', 'Booking', 'OtpCode', 'Client', 'Employee', 'Service', 'Branch', 'OrganizationPaymentConfig']);
  });

  const makeWebhookRequest = (paymentId: string, status: 'paid' | 'failed' = 'paid') => {
    const payload = {
      id: paymentId,
      status,
      amount: 23000,
      currency: 'SAR',
      metadata: { invoiceId },
      message: status === 'failed' ? 'Card declined' : undefined,
    };
    const rawBody = JSON.stringify(payload);
    return {
      payload,
      rawBody,
      signature: sign(rawBody),
    };
  };

  it('first webhook creates payment in COMPLETED status', async () => {
    const { payload, rawBody, signature } = makeWebhookRequest('moyasar-pay-first');
    const result = await handler.execute({ payload, rawBody, signature });

    expect(result).toEqual({});

    const payment = await testPrisma.payment.findFirst({ where: { gatewayRef: 'moyasar-pay-first' } });
    expect(payment).not.toBeNull();
    expect(payment!.status).toBe(PaymentStatus.COMPLETED);

    const invoice = await testPrisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(invoice!.status).toBe('PAID');
  });

  it('second identical webhook is idempotent — no duplicate payment', async () => {
    const { payload, rawBody, signature } = makeWebhookRequest('moyasar-pay-duplicate');

    const result1 = await handler.execute({ payload, rawBody, signature });
    expect(result1).toEqual({});

    const result2 = await handler.execute({ payload, rawBody, signature });
    expect(result2).toEqual({ skipped: true });

    const payments = await testPrisma.payment.findMany({ where: { gatewayRef: 'moyasar-pay-duplicate' } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe(PaymentStatus.COMPLETED);

    const invoice = await testPrisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(invoice!.status).toBe('PAID');
  });

  it('webhook for unknown invoice returns skipped without error', async () => {
    const unknownPayload: {
    id: string;
    status: 'paid' | 'failed' | 'refunded';
    amount: number;
    currency: string;
    metadata: { invoiceId: string };
  } = {
      id: 'unknown-pay',
      status: 'paid',
      amount: 10000,
      currency: 'SAR',
      metadata: { invoiceId: '00000000-0000-0000-0000-000000000000' },
    };
    const rawBody = JSON.stringify(unknownPayload);

    const result = await handler.execute({
      payload: unknownPayload,
      rawBody,
      signature: sign(rawBody),
    });

    expect(result).toEqual({ skipped: true });
  });

  it('webhook for failed payment marks payment as FAILED', async () => {
    const { payload, rawBody, signature } = makeWebhookRequest('moyasar-pay-failed', 'failed');

    await handler.execute({ payload, rawBody, signature });

    const payment = await testPrisma.payment.findFirst({ where: { gatewayRef: 'moyasar-pay-failed' } });
    expect(payment).not.toBeNull();
    expect(payment!.status).toBe(PaymentStatus.FAILED);

    const invoice = await testPrisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(invoice!.status).toBe('ISSUED');
  });

  it('returns 400 for invalid signature', async () => {
    const { payload, rawBody } = makeWebhookRequest('moyasar-pay-badsig');

    await expect(
      handler.execute({ payload, rawBody, signature: 'invalid-signature' }),
    ).rejects.toThrow('Invalid Moyasar webhook signature');
  });
});
