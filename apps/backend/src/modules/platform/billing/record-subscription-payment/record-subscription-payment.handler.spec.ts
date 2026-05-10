import { NotFoundException } from '@nestjs/common';
import { RecordSubscriptionPaymentHandler } from './record-subscription-payment.handler';
import { SubscriptionStateMachine } from '../subscription-state-machine';
import { RlsTransactionService } from '../../../../infrastructure/database';

const FUTURE_PERIOD_END = new Date('2026-06-01T00:00:00.000Z');

const buildSub = (
  overrides: Partial<{
    id: string;
    status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED';
    organizationId: string;
    billingCycle: 'MONTHLY' | 'ANNUAL';
    currentPeriodEnd: Date;
  }> = {},
) => ({
  id: 'sub-1',
  status: 'TRIALING' as const,
  organizationId: 'org-A',
  billingCycle: 'MONTHLY' as const,
  currentPeriodEnd: FUTURE_PERIOD_END,
  ...overrides,
});

const buildTxPrisma = () => ({
  subscriptionInvoice: {
    update: jest.fn().mockResolvedValue({}),
  },
  subscription: {
    update: jest.fn().mockResolvedValue({}),
  },
});

const buildPrisma = (txPrisma = buildTxPrisma()) => ({
  subscriptionInvoice: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(txPrisma)),
  _txPrisma: txPrisma,
  $allTenants: {
    membership: {
      findFirst: jest.fn().mockResolvedValue({
        user: { email: 'owner@example.com', name: 'Owner' },
        organization: { nameAr: 'Org AR' },
      }),
    },
  },
});

const buildCache = () => ({
  invalidate: jest.fn(),
});

const buildMailer = () => ({
  sendSubscriptionPaymentSucceeded: jest.fn().mockResolvedValue(undefined),
});

const buildConfig = () => ({
  get: jest.fn().mockImplementation((_key: string, def: unknown) => def),
});

const buildIssueInvoice = () => ({
  execute: jest.fn().mockResolvedValue({}),
});

const buildEventBus = () => ({
  publish: jest.fn().mockResolvedValue(undefined),
});

const buildRlsTx = (prisma: ReturnType<typeof buildPrisma>) =>
  ({
    withBypassTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma._txPrisma)),
  }) as unknown as RlsTransactionService;

describe('RecordSubscriptionPaymentHandler', () => {
  it('throws NotFoundException for unknown invoice', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionInvoice.findFirst.mockResolvedValue(null);
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await expect(
      handler.execute({ invoiceId: 'inv-unknown', moyasarPaymentId: 'pay-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('transitions TRIALING → ACTIVE on payment', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({ id: 'sub-1', status: 'TRIALING', organizationId: 'org-A' }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    expect(txPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('transitions PAST_DUE → ACTIVE on payment', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({ id: 'sub-1', status: 'PAST_DUE', organizationId: 'org-A' }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    expect(txPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('marks invoice as PAID', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    // ACTIVE → chargeSuccess is not a valid transition — use PAST_DUE
    const sub = buildSub({ id: 'sub-1', status: 'PAST_DUE', organizationId: 'org-A' });
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: 'inv-1', amount: 299, subscription: sub });

    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-abc' });

    expect(txPrisma.subscriptionInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID', moyasarPaymentId: 'pay-abc' }),
      }),
    );
  });

  it('clears pastDueSince on successful payment', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({ id: 'sub-1', status: 'PAST_DUE', organizationId: 'org-A' }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    expect(txPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pastDueSince: null }),
      }),
    );
  });

  it('clears dunning fields on successful payment recovery', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({ id: 'sub-1', status: 'PAST_DUE', organizationId: 'org-A' }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    expect(txPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dunningRetryCount: 0,
          nextRetryAt: null,
          lastFailureReason: null,
        }),
      }),
    );
  });

  it('invalidates cache after recording payment', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    const cache = buildCache();
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({ id: 'sub-1', status: 'TRIALING', organizationId: 'org-A' }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      cache as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    expect(cache.invalidate).toHaveBeenCalledWith('org-A');
  });

  it('sends a payment-succeeded email to the org owner', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({ id: 'sub-1', status: 'TRIALING', organizationId: 'org-A' }),
    });
    const mailer = buildMailer();
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      mailer as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    expect(mailer.sendSubscriptionPaymentSucceeded).toHaveBeenCalledWith(
      'owner@example.com',
      expect.objectContaining({
        amountSar: '299.00',
        invoiceId: 'inv-1',
        receiptUrl: expect.stringContaining('inv-1'),
      }),
    );
  });

  // ─── Bug B2 — period-end advancement ───────────────────────────────────
  // Without these guards a successful charge leaves `currentPeriodEnd` in
  // the past and the cron immediately re-selects the same subscription.
  it('advances currentPeriodEnd by 1 month for MONTHLY plans', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    const periodEnd = new Date('2030-06-15T00:00:00.000Z');
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({
        id: 'sub-1',
        status: 'PAST_DUE',
        organizationId: 'org-A',
        billingCycle: 'MONTHLY',
        currentPeriodEnd: periodEnd,
      }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    const updateCall = txPrisma.subscription.update.mock.calls[0][0] as {
      data: { currentPeriodEnd: Date; currentPeriodStart: Date };
    };
    expect(updateCall.data.currentPeriodEnd.toISOString()).toBe(
      '2030-07-15T00:00:00.000Z',
    );
    expect(updateCall.data.currentPeriodStart.toISOString()).toBe(periodEnd.toISOString());
  });

  it('advances currentPeriodEnd by 12 months for ANNUAL plans', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    const periodEnd = new Date('2030-06-15T00:00:00.000Z');
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 1990,
      subscription: buildSub({
        id: 'sub-1',
        status: 'PAST_DUE',
        organizationId: 'org-A',
        billingCycle: 'ANNUAL',
        currentPeriodEnd: periodEnd,
      }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    const updateCall = txPrisma.subscription.update.mock.calls[0][0] as {
      data: { currentPeriodEnd: Date };
    };
    expect(updateCall.data.currentPeriodEnd.toISOString()).toBe(
      '2031-06-15T00:00:00.000Z',
    );
  });

  it('advances from now (not from past period end) when period already lapsed', async () => {
    // Simulates: trial ended weeks ago, cron just got around to charging.
    // Advancing from the stale period end would put us in the past again
    // and re-trigger the cron next tick.
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    const stalePeriodEnd = new Date('2025-01-01T00:00:00.000Z');
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({
        id: 'sub-1',
        status: 'PAST_DUE',
        organizationId: 'org-A',
        billingCycle: 'MONTHLY',
        currentPeriodEnd: stalePeriodEnd,
      }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    const beforeExecute = Date.now();
    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    const updateCall = txPrisma.subscription.update.mock.calls[0][0] as {
      data: { currentPeriodEnd: Date; currentPeriodStart: Date };
    };
    // Next period end must be > now + ~27 days (one month from "now").
    const nextEndMs = updateCall.data.currentPeriodEnd.getTime();
    expect(nextEndMs).toBeGreaterThan(beforeExecute + 27 * 24 * 60 * 60 * 1000);
    // Period start should be ~now (when we re-anchored), not the stale value.
    expect(updateCall.data.currentPeriodStart.getTime()).toBeGreaterThanOrEqual(
      beforeExecute - 1000,
    );
  });

  it('resets pastDueSince, nextRetryAt, and dunningRetryCount to null/0', async () => {
    const txPrisma = buildTxPrisma();
    const prisma = buildPrisma(txPrisma);
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      amount: 299,
      subscription: buildSub({ id: 'sub-1', status: 'PAST_DUE', organizationId: 'org-A' }),
    });
    const handler = new RecordSubscriptionPaymentHandler(
      prisma as never,
      buildCache() as never,
      new SubscriptionStateMachine(),
      buildMailer() as never,
      buildConfig() as never,
      buildIssueInvoice() as never,
      buildEventBus() as never,
      buildRlsTx(prisma),
    );

    await handler.execute({ invoiceId: 'inv-1', moyasarPaymentId: 'pay-1' });

    expect(txPrisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pastDueSince: null,
          nextRetryAt: null,
          dunningRetryCount: 0,
          retryCount: 0,
          lastFailureReason: null,
        }),
      }),
    );
  });
});
