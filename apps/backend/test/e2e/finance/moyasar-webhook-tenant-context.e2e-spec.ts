import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';
import { MoyasarWebhookHandler } from '../../../src/modules/finance/moyasar-webhook/moyasar-webhook.handler';
import { MoyasarCredentialsService } from '../../../src/infrastructure/payments/moyasar-credentials.service';
import { EventBusService } from '../../../src/infrastructure/events';

/**
 * SaaS-02e §10.6 — Moyasar webhook tenant resolution (most important)
 *
 * Verifies that inbound unsigned/signed webhook events are correctly attributed
 * to the right tenant by resolving the invoice's organizationId from the
 * payload metadata — not from any ambient CLS context.
 *
 * Tests:
 * 1. Webhook for Org A invoice → Payment created under orgA.id
 * 2. Event envelope carries organizationId = orgA.id
 * 3. Second webhook for Org B invoice → Payment created under orgB.id
 * 4. list-payments runAs(A) returns orgA payment only; runAs(B) returns orgB only
 * 5. Idempotency: replay first webhook → { skipped: true }, no duplicate payment
 * 6. Cross-tenant: org A payload signed with org B secret → rejected
 */
describe('SaaS-02e — Moyasar webhook tenant resolution', () => {
  let h: IsolationHarness;

  // Per-org secrets — each tenant gets its own webhook secret
  const SECRET_A = 'test-webhook-secret-02e-orgA';
  const SECRET_B = 'test-webhook-secret-02e-orgB';

  function signWith(rawBody: string, secret: string): string {
    return createHmac('sha256', secret).update(rawBody).digest('hex');
  }

  function buildPayload(invoiceId: string, paymentId: string) {
    return {
      id: paymentId,
      status: 'paid' as const,
      amount: 23000, // 230 SAR in halalas
      currency: 'SAR',
      metadata: { invoiceId },
    };
  }

  beforeAll(async () => {
    h = await bootHarness();
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Helper: seed a booking + invoice in a given org
  // ──────────────────────────────────────────────────────────────────────────

  async function seedInvoice(orgId: string, suffix: string): Promise<string> {
    const bookingId = crypto.randomUUID();
    await h.prisma.booking.create({
      data: {
        id: bookingId,
        organizationId: orgId,
        branchId: `br-wh-${suffix}`,
        clientId: `cli-wh-${suffix}`,
        employeeId: `emp-wh-${suffix}`,
        serviceId: `svc-wh-${suffix}`,
        scheduledAt: new Date('2031-09-01T10:00:00Z'),
        endsAt: new Date('2031-09-01T11:00:00Z'),
        durationMins: 60,
        price: 200,
        currency: 'SAR',
        bookingNumber: 1,
      },
    });

    const invoice = await h.prisma.invoice.create({
      data: {
        organizationId: orgId,
        bookingId,
        branchId: `br-wh-${suffix}`,
        clientId: `cli-wh-${suffix}`,
        employeeId: `emp-wh-${suffix}`,
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

    return invoice.id;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helper: seed an OrganizationPaymentConfig for an org
  // ──────────────────────────────────────────────────────────────────────────

  async function seedPaymentConfig(orgId: string, webhookSecret: string): Promise<void> {
    const creds = h.app.get(MoyasarCredentialsService);
    await h.runAs({ organizationId: orgId }, () =>
      h.prisma.organizationPaymentConfig.create({
        data: {
          organizationId: orgId,
          publishableKey: 'pk_test_xxxxxxxxxxxxxxxxxxxx',
          secretKeyEnc: creds.encrypt({ secretKey: 'sk_test_xxxxxxxxxxxxxxxxxxxx' }, orgId),
          webhookSecretEnc: creds.encrypt({ webhookSecret }, orgId),
          isLive: false,
        },
      }),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Main test: cross-org webhook + idempotency
  // ──────────────────────────────────────────────────────────────────────────

  it('webhook resolves to correct org; cross-org payments isolated; idempotency works', async () => {
    const ts = Date.now();
    const orgA = await h.createOrg(`wh-iso-a-${ts}`, 'منظمة ويب هوك أ');
    const orgB = await h.createOrg(`wh-iso-b-${ts}`, 'منظمة ويب هوك ب');

    // Seed per-tenant payment configs with distinct webhook secrets
    await seedPaymentConfig(orgA.id, SECRET_A);
    await seedPaymentConfig(orgB.id, SECRET_B);

    // Seed invoices without tenant CLS (raw — webhook handler reads system context)
    const invAId = await seedInvoice(orgA.id, `a-${ts}`);
    const invBId = await seedInvoice(orgB.id, `b-${ts}`);

    const webhookHandler = h.app.get(MoyasarWebhookHandler);
    const eventBus = h.app.get(EventBusService);

    // Spy on eventBus.publish to capture event envelopes
    const publishedEvents: Array<{ name: string; envelope: unknown }> = [];
    const originalPublish = eventBus.publish.bind(eventBus);
    jest
      .spyOn(eventBus, 'publish')
      .mockImplementation(async (eventName: string, envelope: unknown) => {
        publishedEvents.push({ name: eventName, envelope });
        return originalPublish(eventName, envelope as Parameters<typeof originalPublish>[1]);
      });

    // ── Send webhook for Org A invoice ──────────────────────────────────────
    const paymentIdA = `mys-wh-a-${ts}`;
    const payloadA = buildPayload(invAId, paymentIdA);
    const rawBodyA = JSON.stringify(payloadA);
    const sigA = signWith(rawBodyA, SECRET_A);

    const resultA = await webhookHandler.execute({
      payload: payloadA,
      rawBody: rawBodyA,
      signature: sigA,
    });
    expect(resultA).not.toHaveProperty('skipped');

    // Payment must be attributed to Org A
    const payA = await h.prisma.payment.findFirst({
      where: { gatewayRef: paymentIdA },
    });
    expect(payA).not.toBeNull();
    expect(payA!.organizationId).toBe(orgA.id);

    // Event envelope must carry organizationId = orgA.id
    const eventA = publishedEvents.find((e) => e.name === 'finance.payment.completed');
    expect(eventA).toBeDefined();
    const envelopeA = eventA!.envelope as {
      payload: { organizationId?: string };
    };
    expect(envelopeA.payload.organizationId).toBe(orgA.id);

    publishedEvents.length = 0; // reset for Org B

    // ── Send webhook for Org B invoice ──────────────────────────────────────
    const paymentIdB = `mys-wh-b-${ts}`;
    const payloadB = buildPayload(invBId, paymentIdB);
    const rawBodyB = JSON.stringify(payloadB);
    const sigB = signWith(rawBodyB, SECRET_B);

    const resultB = await webhookHandler.execute({
      payload: payloadB,
      rawBody: rawBodyB,
      signature: sigB,
    });
    expect(resultB).not.toHaveProperty('skipped');

    // Payment must be attributed to Org B
    const payB = await h.prisma.payment.findFirst({
      where: { gatewayRef: paymentIdB },
    });
    expect(payB).not.toBeNull();
    expect(payB!.organizationId).toBe(orgB.id);

    // Event envelope must carry organizationId = orgB.id
    const eventB = publishedEvents.find((e) => e.name === 'finance.payment.completed');
    expect(eventB).toBeDefined();
    const envelopeB = eventB!.envelope as { payload: { organizationId?: string } };
    expect(envelopeB.payload.organizationId).toBe(orgB.id);

    // ── Isolation: list-payments scoped by CLS context ───────────────────────
    let paymentsFromA: Awaited<ReturnType<typeof h.prisma.payment.findMany>>;
    await h.runAs({ organizationId: orgA.id }, async () => {
      paymentsFromA = await h.prisma.payment.findMany({
        where: { gatewayRef: { in: [paymentIdA, paymentIdB] } },
      });
    });
    expect(paymentsFromA!).toHaveLength(1);
    expect(paymentsFromA![0].organizationId).toBe(orgA.id);

    let paymentsFromB: Awaited<ReturnType<typeof h.prisma.payment.findMany>>;
    await h.runAs({ organizationId: orgB.id }, async () => {
      paymentsFromB = await h.prisma.payment.findMany({
        where: { gatewayRef: { in: [paymentIdA, paymentIdB] } },
      });
    });
    expect(paymentsFromB!).toHaveLength(1);
    expect(paymentsFromB![0].organizationId).toBe(orgB.id);

    // ── Idempotency: replay Org A's webhook ─────────────────────────────────
    const idempotentResult = await webhookHandler.execute({
      payload: payloadA,
      rawBody: rawBodyA,
      signature: sigA,
    });
    expect(idempotentResult).toEqual({ skipped: true });

    // No duplicate payment created
    const countA = await h.prisma.payment.count({
      where: { gatewayRef: paymentIdA },
    });
    expect(countA).toBe(1);

    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Invalid signature is rejected
  // ──────────────────────────────────────────────────────────────────────────

  it('webhook with invalid signature is rejected', async () => {
    const ts = Date.now();
    const orgA = await h.createOrg(`wh-sig-a-${ts}`, 'منظمة توقيع أ');
    await seedPaymentConfig(orgA.id, SECRET_A);
    const invId = await seedInvoice(orgA.id, `sig-${ts}`);
    const payload = buildPayload(invId, `mys-sig-${ts}`);
    const rawBody = JSON.stringify(payload);

    const webhookHandler = h.app.get(MoyasarWebhookHandler);

    await expect(
      webhookHandler.execute({
        payload,
        rawBody,
        signature: 'deadbeef00000000000000000000000000000000000000000000000000000000',
      }),
    ).rejects.toThrow();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cross-tenant: org A payload signed with org B secret → rejected
  // ──────────────────────────────────────────────────────────────────────────

  it('rejects org A payload signed with org B secret', async () => {
    const ts2 = Date.now();
    const orgC = await h.createOrg(`wh-cross-c-${ts2}`, 'منظمة عابرة ج');
    const orgD = await h.createOrg(`wh-cross-d-${ts2}`, 'منظمة عابرة د');
    const SECRET_C = 'secret-for-org-c';
    const SECRET_D = 'secret-for-org-d';
    await seedPaymentConfig(orgC.id, SECRET_C);
    await seedPaymentConfig(orgD.id, SECRET_D);

    const invCId = await seedInvoice(orgC.id, `c-${ts2}`);
    const payloadC = buildPayload(invCId, `mys-cross-c-${ts2}`);
    const rawBodyC = JSON.stringify(payloadC);
    // Sign org C's payload with org D's secret — should be rejected
    const wrongSig = signWith(rawBodyC, SECRET_D);

    const webhookHandler = h.app.get(MoyasarWebhookHandler);
    await expect(
      webhookHandler.execute({ payload: payloadC, rawBody: rawBodyC, signature: wrongSig }),
    ).rejects.toThrow(BadRequestException);
  });
});
