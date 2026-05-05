import { NotFoundException } from '@nestjs/common';
import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';
import { VerifyPaymentHandler } from '../../../src/modules/finance/verify-payment/verify-payment.handler';
import { PaymentStatus } from '@prisma/client';

/**
 * SaaS-02e §10.2 — Payment cross-tenant isolation
 *
 * 1. Payment created in Org A is invisible from Org B (list returns empty).
 * 2. verify-payment on Org A's payment from Org B context throws NotFoundException.
 */
describe('SaaS-02e — payment isolation', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Payment in Org A is invisible from Org B list
  // ──────────────────────────────────────────────────────────────────────────

  it('payment created in org A is invisible from org B', async () => {
    const a = await h.createOrg(`pay-iso-a-${Date.now()}`, 'منظمة دفع أ');
    const b = await h.createOrg(`pay-iso-b-${Date.now()}`, 'منظمة دفع ب');

    // Seed invoice in Org A (needed as FK for payment)
    const bookingId = crypto.randomUUID();
    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingId,
          organizationId: a.id,
          branchId: 'br-pay-a',
          clientId: 'cli-pay-a',
          employeeId: 'emp-pay-a',
          serviceId: 'svc-pay-a',
          scheduledAt: new Date('2031-04-01T10:00:00Z'),
          endsAt: new Date('2031-04-01T11:00:00Z'),
          durationMins: 60,
          price: 200,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const invoice = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: a.id,
          bookingId,
          branchId: 'br-pay-a',
          clientId: 'cli-pay-a',
          employeeId: 'emp-pay-a',
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
      }),
    );

    const payA = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.payment.create({
        data: {
          organizationId: a.id,
          invoiceId: invoice.id,
          amount: 230,
          currency: 'SAR',
          method: 'ONLINE_CARD',
          status: PaymentStatus.COMPLETED,
          idempotencyKey: `pay-iso-${crypto.randomUUID()}`,
          processedAt: new Date(),
        },
        select: { id: true },
      }),
    );

    let fromB: Awaited<ReturnType<typeof h.prisma.payment.findFirst>>;
    await h.runAs({ organizationId: b.id }, async () => {
      fromB = await h.prisma.payment.findFirst({ where: { id: payA.id } });
    });

    expect(fromB!).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. verify-payment for Org A's payment from Org B throws NotFoundException
  // ──────────────────────────────────────────────────────────────────────────

  it('verify-payment for org A payment from org B throws NotFoundException', async () => {
    const a = await h.createOrg(`pay-verify-a-${Date.now()}`, 'منظمة تحقق أ');
    const b = await h.createOrg(`pay-verify-b-${Date.now()}`, 'منظمة تحقق ب');

    const bookingId = crypto.randomUUID();
    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingId,
          organizationId: a.id,
          branchId: 'br-verify-a',
          clientId: 'cli-verify-a',
          employeeId: 'emp-verify-a',
          serviceId: 'svc-verify-a',
          scheduledAt: new Date('2031-05-01T10:00:00Z'),
          endsAt: new Date('2031-05-01T11:00:00Z'),
          durationMins: 60,
          price: 300,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const invoice = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: a.id,
          bookingId,
          branchId: 'br-verify-a',
          clientId: 'cli-verify-a',
          employeeId: 'emp-verify-a',
          subtotal: 300,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 45,
          total: 345,
          status: 'ISSUED',
          issuedAt: new Date(),
          currency: 'SAR',
        },
        select: { id: true },
      }),
    );

    const payA = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.payment.create({
        data: {
          organizationId: a.id,
          invoiceId: invoice.id,
          amount: 345,
          currency: 'SAR',
          method: 'BANK_TRANSFER',
          status: PaymentStatus.PENDING_VERIFICATION,
          idempotencyKey: `pay-verify-iso-${crypto.randomUUID()}`,
        },
        select: { id: true },
      }),
    );

    const verifyHandler = h.app.get(VerifyPaymentHandler);

    await expect(
      h.runAs({ organizationId: b.id }, () =>
        verifyHandler.execute({ paymentId: payA.id, action: 'approve' }),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
