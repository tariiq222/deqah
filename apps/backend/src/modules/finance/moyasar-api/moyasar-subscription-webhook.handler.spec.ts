import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MoyasarSubscriptionWebhookHandler } from './moyasar-subscription-webhook.handler';

const TEST_SECRET = 'test-webhook-secret';
const ORG_ID = 'org-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function sign(rawBody: string, secret = TEST_SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function buildClient(valid = true) {
  return {
    verifyWebhookSignature: jest.fn().mockReturnValue(valid),
  };
}

function buildSubscription(organizationId = ORG_ID) {
  return { id: 'sub-1', organizationId };
}

function buildInvoice(overrides?: { id?: string; amount?: number; currency?: string; subscription?: ReturnType<typeof buildSubscription> } | null) {
  if (overrides === null) return null;
  return {
    id: 'inv-sub-1',
    amount: 230,
    currency: 'SAR',
    subscription: buildSubscription(),
    ...overrides,
  };
}

interface PrismaMock {
  subscriptionInvoice: { findFirst: jest.Mock };
  webhookEvent: {
    create: jest.Mock;
    update: jest.Mock;
  };
}

function buildPrisma(invoice = buildInvoice()): PrismaMock {
  return {
    subscriptionInvoice: {
      findFirst: jest.fn().mockResolvedValue(invoice),
    },
    webhookEvent: {
      create: jest.fn().mockResolvedValue({ id: 'whe-1' }),
      update: jest.fn().mockResolvedValue({ id: 'whe-1' }),
    },
  };
}

function buildCls() {
  const store: Record<string, unknown> = {};
  return {
    run: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    set: jest.fn((key: string, value: unknown) => { store[key] = value; }),
    get: jest.fn((key: string) => store[key]),
  };
}

function buildRecordPayment() {
  return { execute: jest.fn().mockResolvedValue({ ok: true }) };
}

function buildRecordFailure() {
  return { execute: jest.fn().mockResolvedValue({ ok: true }) };
}

function makeHandler(overrides: {
  clientValid?: boolean;
  invoice?: ReturnType<typeof buildInvoice>;
  prisma?: PrismaMock;
} = {}) {
  const client = buildClient(overrides.clientValid ?? true);
  const prisma = overrides.prisma ?? buildPrisma(overrides.invoice ?? buildInvoice());
  const cls = buildCls();
  const recordPayment = buildRecordPayment();
  const recordFailure = buildRecordFailure();

  const handler = new MoyasarSubscriptionWebhookHandler(
    client as never,
    prisma as never,
    cls as never,
    recordPayment as never,
    recordFailure as never,
  );

  return { handler, client, prisma, cls, recordPayment, recordFailure };
}

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`provider`,`eventId`)',
    { code: 'P2002', clientVersion: '7.8.0', meta: { target: ['provider', 'eventId'] } },
  );
}

describe('MoyasarSubscriptionWebhookHandler', () => {
  // amount in halalas: invoice.amount=230 SAR → 23000 halalas; currency must match invoice.currency='SAR'
  const paidEvent = { id: 'evt-1', type: 'payment_paid', data: { id: 'mpay-1', status: 'paid', amount: 23000, currency: 'SAR' } };
  const failedEvent = { id: 'evt-2', type: 'payment_failed', data: { id: 'mpay-1', status: 'failed', amount: 23000, currency: 'SAR', source: { message: 'declined' } } };

  function rawBody(event: object): Buffer {
    return Buffer.from(JSON.stringify(event), 'utf8');
  }

  it('throws UnauthorizedException when signature is invalid', async () => {
    const { handler } = makeHandler({ clientValid: false });
    await expect(
      handler.execute(rawBody(paidEvent), 'bad-sig'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns { ok: true } without error for unknown moyasarPaymentId', async () => {
    const { handler } = makeHandler({ invoice: null });
    const result = await handler.execute(rawBody(paidEvent), sign(JSON.stringify(paidEvent)));
    expect(result).toEqual({ ok: true });
  });

  it('calls recordPayment.execute for payment_paid event', async () => {
    const { handler, recordPayment } = makeHandler();
    await handler.execute(rawBody(paidEvent), sign(JSON.stringify(paidEvent)));
    expect(recordPayment.execute).toHaveBeenCalledWith({
      invoiceId: 'inv-sub-1',
      moyasarPaymentId: 'mpay-1',
    });
  });

  it('calls recordFailure.execute for payment_failed event', async () => {
    const { handler, recordFailure } = makeHandler();
    await handler.execute(rawBody(failedEvent), sign(JSON.stringify(failedEvent)));
    expect(recordFailure.execute).toHaveBeenCalledWith({
      invoiceId: 'inv-sub-1',
      moyasarPaymentId: 'mpay-1',
      reason: 'declined',
    });
  });

  it('uses "unknown" as failure reason when source.message is absent', async () => {
    const { handler, recordFailure } = makeHandler();
    const noMsgEvent = { id: 'evt-3', type: 'payment_failed', data: { id: 'mpay-1', status: 'failed', amount: 23000, currency: 'SAR' } };
    await handler.execute(rawBody(noMsgEvent), sign(JSON.stringify(noMsgEvent)));
    expect(recordFailure.execute).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'unknown' }),
    );
  });

  it('records the webhook event then marks it processed on success', async () => {
    const { handler, prisma } = makeHandler();
    await handler.execute(rawBody(paidEvent), sign(JSON.stringify(paidEvent)));

    expect(prisma.webhookEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider: 'MOYASAR_PLATFORM',
        eventId: 'evt-1',
        eventType: 'payment_paid',
        payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    }));
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'whe-1' },
      data: expect.objectContaining({ result: 'processed', processedAt: expect.any(Date) }),
    }));
  });

  it('skips processing when the same webhook event id is delivered twice (P2002)', async () => {
    const prisma = buildPrisma();
    // First call resolves; second rejects with P2002.
    prisma.webhookEvent.create
      .mockResolvedValueOnce({ id: 'whe-1' })
      .mockRejectedValueOnce(p2002Error());

    const { handler, recordPayment } = makeHandler({ prisma });

    const first = await handler.execute(rawBody(paidEvent), sign(JSON.stringify(paidEvent)));
    expect(first).toEqual({ ok: true });
    expect(recordPayment.execute).toHaveBeenCalledTimes(1);

    recordPayment.execute.mockClear();

    const second = await handler.execute(rawBody(paidEvent), sign(JSON.stringify(paidEvent)));
    expect(second).toEqual({ ok: true, deduped: true });
    expect(recordPayment.execute).not.toHaveBeenCalled();
    // The duplicate was rejected before we ever touched processing state.
    expect(prisma.subscriptionInvoice.findFirst).toHaveBeenCalledTimes(1);
  });

  it('marks the webhook event as error and re-throws when processing fails', async () => {
    const { handler, prisma, recordPayment } = makeHandler();
    const boom = new Error('record-payment failure');
    recordPayment.execute.mockRejectedValueOnce(boom);

    await expect(
      handler.execute(rawBody(paidEvent), sign(JSON.stringify(paidEvent))),
    ).rejects.toBe(boom);

    // Two update calls: success-mark would have run only on the happy path; here
    // we expect a single update marking it as error.
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'whe-1' },
      data: expect.objectContaining({ result: 'error', processedAt: expect.any(Date) }),
    }));
  });
});
