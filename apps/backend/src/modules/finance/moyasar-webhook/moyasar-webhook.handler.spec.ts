import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { MoyasarWebhookHandler, MoyasarWebhookRequest } from './moyasar-webhook.handler';
import { MoyasarWebhookDto } from './moyasar-webhook.dto';

const TEST_SECRET = 'test-secret';
const FAKE_CIPHERTEXT = 'fake-encrypted-webhook-secret-ciphertext';

const ORG_A = 'org-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'org-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function buildInvoice(organizationId: string, id: string = 'inv-1'): Record<string, unknown> {
  return { id, organizationId, bookingId: `booking-${id}`, clientId: `client-${id}`, currency: 'SAR', total: 230, status: 'ISSUED' };
}

function buildPaymentConfig(organizationId: string): Record<string, unknown> {
  return { id: `cfg-${organizationId}`, organizationId, publishableKey: 'pk_test_xxxx', secretKeyEnc: 'fake-secret-key-enc', webhookSecretEnc: FAKE_CIPHERTEXT, isLive: false };
}

function buildPayment(organizationId: string, id: string = 'pay-1'): Record<string, unknown> {
  return { id, organizationId, invoiceId: 'inv-1', status: PaymentStatus.COMPLETED };
}

interface MockPrisma {
  payment: {
    findFirst: jest.Mock;
    upsert: jest.Mock;
  };
  invoice: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  organizationPaymentConfig: {
    findUnique: jest.Mock;
  };
  webhookEvent: {
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

function buildPrisma(invoiceOverride?: Record<string, unknown> | null, configOverride?: Record<string, unknown> | null): MockPrisma {
  const paymentFindFirst = jest.fn().mockResolvedValue(null);
  const paymentUpsert = jest.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
    Promise.resolve(buildPayment(create.organizationId as string)),
  );
  const invoiceFindFirst = jest.fn().mockResolvedValue(
    invoiceOverride === null ? null : invoiceOverride ?? buildInvoice(ORG_A),
  );
  const invoiceUpdate = jest.fn().mockResolvedValue({ status: 'PAID' });

  const prisma: MockPrisma = {
    payment: {
      findFirst: paymentFindFirst,
      upsert: paymentUpsert,
    },
    invoice: {
      findFirst: invoiceFindFirst,
      update: invoiceUpdate,
    },
    organizationPaymentConfig: {
      findUnique: jest.fn().mockResolvedValue(
        configOverride === null ? null : configOverride ?? buildPaymentConfig(ORG_A),
      ),
    },
    webhookEvent: {
      create: jest.fn().mockResolvedValue({ id: 'whe-1' }),
      update: jest.fn().mockResolvedValue({ id: 'whe-1' }),
    },
    $transaction: jest.fn(async <T>(fn: (tx: MockPrisma) => Promise<T>): Promise<T> => {
      return fn(prisma);
    }),
  };

  return prisma;
}

const buildEventBus = () => ({ publish: jest.fn().mockResolvedValue(undefined) });

const buildCreds = (secret: string = TEST_SECRET) => ({
  decrypt: jest.fn().mockReturnValue({ webhookSecret: secret }),
  encrypt: jest.fn().mockReturnValue(FAKE_CIPHERTEXT),
});

function buildCls() {
  const store: Record<string, unknown> = {};
  return {
    run: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    set: jest.fn((key: string, value: unknown) => { store[key] = value; }),
    get: jest.fn((key: string) => store[key]),
  };
}

const paidPayload: MoyasarWebhookDto = {
  id: 'moyasar-pay-1', status: 'paid', amount: 23000, currency: 'SAR',
  metadata: { invoiceId: 'inv-1' },
} as MoyasarWebhookDto;

const sign = (rawBody: string, secret: string = TEST_SECRET) =>
  createHmac('sha256', secret).update(rawBody).digest('hex');

function makeReq(payload: MoyasarWebhookDto = paidPayload, rawBody?: string): MoyasarWebhookRequest {
  const body = rawBody ?? JSON.stringify(payload);
  return { payload, rawBody: body, signature: sign(body) };
}

interface HandlerOverrides {
  prisma?: ReturnType<typeof buildPrisma>;
  eventBus?: ReturnType<typeof buildEventBus>;
  creds?: ReturnType<typeof buildCreds>;
  cls?: ReturnType<typeof buildCls>;
}

const buildAppMetrics = () => ({
  paymentAttempts: { labels: jest.fn().mockReturnValue({ inc: jest.fn() }) },
});

function makeHandler(overrides: HandlerOverrides = {}) {
  const prisma = overrides.prisma ?? buildPrisma();
  const eventBus = overrides.eventBus ?? buildEventBus();
  const creds = overrides.creds ?? buildCreds();
  const cls = overrides.cls ?? buildCls();
  const rlsTx = { withTransaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)) };
  const appMetrics = buildAppMetrics();
  const handler = new MoyasarWebhookHandler(prisma as never, eventBus as never, cls as never, creds as never, rlsTx as never, appMetrics as never);
  return { handler, prisma, eventBus, creds, cls, appMetrics };
}

describe('MoyasarWebhookHandler', () => {
  describe('verifySignature', () => {
    it('passes for valid signature', () => {
      const { handler } = makeHandler();
      const body = '{"id":"test"}';
      expect(() => handler.verifySignature(body, sign(body), TEST_SECRET)).not.toThrow();
    });

    it('throws BadRequestException for invalid signature', () => {
      const { handler } = makeHandler();
      const body = '{"id":"test"}';
      expect(() => handler.verifySignature(body, sign(body, 'wrong-secret'), TEST_SECRET)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when signature length differs (not timing-attackable)', () => {
      const { handler } = makeHandler();
      expect(() => handler.verifySignature('body', 'deadbeef', TEST_SECRET)).toThrow(BadRequestException);
    });
  });

  describe('execute', () => {
    it('processes paid webhook and emits PaymentCompletedEvent', async () => {
      const { handler, prisma, eventBus } = makeHandler();
      const result = await handler.execute(makeReq());
      expect(prisma.payment.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { idempotencyKey: 'moyasar:moyasar-pay-1' },
        create: expect.objectContaining({ amount: 230, status: 'COMPLETED', organizationId: ORG_A }),
      }));
      expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }));
      expect(eventBus.publish).toHaveBeenCalledWith('finance.payment.completed', expect.anything());
      expect(result.skipped).toBeUndefined();
    });

    it('carries organizationId from invoice into the published event envelope', async () => {
      const { handler, eventBus } = makeHandler();
      await handler.execute(makeReq());
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const envelope = eventBus.publish.mock.calls[0][1] as { payload: { organizationId: string } };
      expect(envelope.payload.organizationId).toBe(ORG_A);
    });

    it('routes payments to the correct org based on the invoice payload (two-org isolation)', async () => {
      const { handler, prisma, eventBus } = makeHandler({
        prisma: buildPrisma(buildInvoice(ORG_B, 'inv-b'), buildPaymentConfig(ORG_B)),
        creds: buildCreds(TEST_SECRET),
      });
      await handler.execute(makeReq({ ...paidPayload, metadata: { invoiceId: 'inv-b' } }));
      expect(prisma.payment.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ organizationId: ORG_B }),
      }));
      const envelope = eventBus.publish.mock.calls[0][1] as { payload: { organizationId: string } };
      expect(envelope.payload.organizationId).toBe(ORG_B);
    });

    it('skips silently when webhook event already processed (idempotent via P2002)', async () => {
      const prisma = buildPrisma();
      // Simulate duplicate delivery: webhookEvent.create throws P2002
      prisma.webhookEvent.create = jest.fn().mockRejectedValue(
        new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)(
          'Unique constraint failed',
          { code: 'P2002', clientVersion: '7.8.0', meta: { target: ['provider', 'eventId'] } },
        ),
      );
      const { handler, eventBus } = makeHandler({ prisma });
      const result = await handler.execute(makeReq());
      expect(prisma.payment.upsert).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(result.skipped).toBe(true);
    });

    it('skips when metadata is missing', async () => {
      const { handler } = makeHandler();
      const result = await handler.execute(makeReq({ ...paidPayload, metadata: undefined }));
      expect(result.skipped).toBe(true);
    });

    it('skips when invoice is not found (unknown to this deployment)', async () => {
      const { handler, prisma } = makeHandler({ prisma: buildPrisma(null) });
      const result = await handler.execute(makeReq());
      expect(result.skipped).toBe(true);
      expect(prisma.payment.upsert).not.toHaveBeenCalled();
    });

    it('creates failed payment for non-paid status', async () => {
      const { handler, prisma } = makeHandler();
      const failedPayload = { ...paidPayload, status: 'failed' as const, message: 'Declined' } as MoyasarWebhookDto;
      await handler.execute(makeReq(failedPayload));
      expect(prisma.payment.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ status: 'FAILED', failureReason: 'Declined', organizationId: ORG_A }),
      }));
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('rejects a webhook with a forged signature', async () => {
      const { handler } = makeHandler();
      const rawBody = JSON.stringify(paidPayload);
      await expect(
        handler.execute({ payload: paidPayload, rawBody, signature: sign(rawBody, 'attacker-secret') }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when tenant payment config is missing', async () => {
      const { handler } = makeHandler({ prisma: buildPrisma(undefined, null) });
      await expect(handler.execute(makeReq())).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when webhook secret decryption fails', async () => {
      const badCreds = { decrypt: jest.fn().mockImplementation(() => { throw new Error('decryption failed'); }), encrypt: jest.fn() };
      const { handler } = makeHandler({ creds: badCreds });
      await expect(handler.execute(makeReq())).rejects.toThrow(BadRequestException);
    });

    it('rejects signature signed with a different tenant secret (cross-tenant forgery)', async () => {
      const rawBody = JSON.stringify(paidPayload);
      const sigWithWrongKey = sign(rawBody, 'org-b-secret-different');
      const { handler } = makeHandler();
      // handler decrypts TEST_SECRET for Org A; signing with wrong key → mismatch
      await expect(
        handler.execute({ payload: paidPayload, rawBody, signature: sigWithWrongKey }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses tenant-specific secret from MoyasarCredentialsService (not env)', async () => {
      const { handler, creds } = makeHandler();
      await handler.execute(makeReq());
      expect(creds.decrypt).toHaveBeenCalledWith(FAKE_CIPHERTEXT, ORG_A);
    });

    it('enters system context for tenant resolution (bypass flag set)', async () => {
      const { handler, cls } = makeHandler();
      await handler.execute(makeReq());
      expect(cls.set).toHaveBeenCalledWith('systemContext', true);
      expect(cls.set).toHaveBeenCalledWith('tenant', expect.objectContaining({ organizationId: ORG_A }));
    });

    it('rejects payload when amount does not match invoice.total * 100', async () => {
      // Invoice total=230 SAR → expected halalas=23000; send 100 halalas (1 SAR) instead.
      const mismatchPayload: MoyasarWebhookDto = {
        ...paidPayload,
        amount: 100, // 1 SAR instead of 230 SAR
      } as MoyasarWebhookDto;
      const { handler, prisma } = makeHandler();
      await expect(handler.execute(makeReq(mismatchPayload))).rejects.toThrow(BadRequestException);
      await expect(handler.execute(makeReq(mismatchPayload))).rejects.toThrow(/amount does not match/i);
      // Invoice must remain in DUE/ISSUED state — update must not have been called.
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('rejects payload when currency does not match invoice.currency', async () => {
      // Invoice currency=SAR (from buildInvoice), payload currency=KWD, amount matches.
      const wrongCurrencyPayload: MoyasarWebhookDto = {
        ...paidPayload,
        amount: 23000, // correct halala amount for 230 SAR invoice
        currency: 'KWD',
      } as MoyasarWebhookDto;
      const { handler } = makeHandler();
      await expect(handler.execute(makeReq(wrongCurrencyPayload))).rejects.toThrow(BadRequestException);
      await expect(handler.execute(makeReq(wrongCurrencyPayload))).rejects.toThrow(/currency does not match/i);
    });

    it('rejects payload when amount is zero (DTO validation)', async () => {
      const dto = plainToInstance(MoyasarWebhookDto, {
        id: 'pay-zero',
        status: 'paid',
        amount: 0,
        currency: 'SAR',
        metadata: { invoiceId: 'inv-1' },
      });
      const errors = await validate(dto);
      const amountErrors = errors.filter((e) => e.property === 'amount');
      expect(amountErrors.length).toBeGreaterThan(0);
    });
  });
});
