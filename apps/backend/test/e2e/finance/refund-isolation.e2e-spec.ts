import { NotFoundException } from '@nestjs/common';
import { bootHarness, IsolationHarness } from '../../tenant-isolation/isolation-harness';
import { ApproveRefundHandler } from '../../../src/modules/finance/refund-payment/approve-refund.handler';
import { PaymentStatus } from '@prisma/client';

/**
 * SaaS-02e §10.4 — RefundRequest cross-tenant isolation
 *
 * 1. RefundRequest created in Org A → list-refunds in Org B returns empty.
 * 2. approve-refund from Org B for Org A's RefundRequest throws NotFoundException.
 */
describe('SaaS-02e — refund isolation', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  afterAll(async () => {
    if (h) await h.close();
  });

  // Helper: seed a paid invoice + completed payment in a given org
  async function seedPaidInvoiceWithPayment(
    orgId: string,
    suffix: string,
  ): Promise<{ invoiceId: string; paymentId: string; clientId: string }> {
    const bookingId = crypto.randomUUID();
    const clientId = `cli-refund-${suffix}`;

    await h.runAs({ organizationId: orgId }, () =>
      h.prisma.booking.create({
        data: {
          id: bookingId,
          organizationId: orgId,
          branchId: `br-refund-${suffix}`,
          clientId,
          employeeId: `emp-refund-${suffix}`,
          serviceId: `svc-refund-${suffix}`,
          scheduledAt: new Date('2031-07-01T10:00:00Z'),
          endsAt: new Date('2031-07-01T11:00:00Z'),
          durationMins: 60,
          price: 250,
          currency: 'SAR',
          bookingNumber: 1,
        },
        select: { id: true },
      }),
    );

    const invoice = await h.runAs({ organizationId: orgId }, () =>
      h.prisma.invoice.create({
        data: {
          organizationId: orgId,
          bookingId,
          branchId: `br-refund-${suffix}`,
          clientId,
          employeeId: `emp-refund-${suffix}`,
          subtotal: 250,
          discountAmt: 0,
          vatRate: 0.15,
          vatAmt: 37.5,
          total: 287.5,
          status: 'PAID',
          issuedAt: new Date(),
          paidAt: new Date(),
          currency: 'SAR',
        },
        select: { id: true },
      }),
    );

    const payment = await h.runAs({ organizationId: orgId }, () =>
      h.prisma.payment.create({
        data: {
          organizationId: orgId,
          invoiceId: invoice.id,
          amount: 287.5,
          currency: 'SAR',
          method: 'ONLINE_CARD',
          status: PaymentStatus.COMPLETED,
          idempotencyKey: `refund-iso-pay-${suffix}`,
          processedAt: new Date(),
        },
        select: { id: true },
      }),
    );

    return { invoiceId: invoice.id, paymentId: payment.id, clientId };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. RefundRequest in Org A is invisible from Org B (findMany returns empty)
  // ──────────────────────────────────────────────────────────────────────────

  it('refund request created in org A is invisible from org B', async () => {
    const ts = Date.now();
    const a = await h.createOrg(`rfd-iso-a-${ts}`, 'منظمة استرداد أ');
    const b = await h.createOrg(`rfd-iso-b-${ts}`, 'منظمة استرداد ب');

    const { invoiceId, paymentId, clientId } = await seedPaidInvoiceWithPayment(
      a.id,
      `a-${ts}`,
    );

    await h.runAs({ organizationId: a.id }, () =>
      h.prisma.refundRequest.create({
        data: {
          organizationId: a.id,
          invoiceId,
          paymentId,
          clientId,
          amount: 287.5,
          status: 'PENDING_REVIEW',
        },
        select: { id: true },
      }),
    );

    let fromB: Awaited<ReturnType<typeof h.prisma.refundRequest.findMany>>;
    await h.runAs({ organizationId: b.id }, async () => {
      fromB = await h.prisma.refundRequest.findMany({ where: { invoiceId } });
    });

    expect(fromB!).toEqual([]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. approve-refund from Org B for Org A's RefundRequest throws NotFoundException
  // ──────────────────────────────────────────────────────────────────────────

  it('approve-refund from org B for org A refund request throws NotFoundException', async () => {
    const ts = Date.now();
    const a = await h.createOrg(`rfd-approve-a-${ts}`, 'منظمة موافقة استرداد أ');
    const b = await h.createOrg(`rfd-approve-b-${ts}`, 'منظمة موافقة استرداد ب');

    const { invoiceId, paymentId, clientId } = await seedPaidInvoiceWithPayment(
      a.id,
      `approve-${ts}`,
    );

    const refundA = await h.runAs({ organizationId: a.id }, () =>
      h.prisma.refundRequest.create({
        data: {
          organizationId: a.id,
          invoiceId,
          paymentId,
          clientId,
          amount: 287.5,
          status: 'PENDING_REVIEW',
        },
        select: { id: true },
      }),
    );

    const approveRefundHandler = h.app.get(ApproveRefundHandler);

    // From Org B context, the refundRequest.findFirst returns null → NotFoundException
    await expect(
      h.runAs({ organizationId: b.id }, () =>
        approveRefundHandler.execute({
          refundRequestId: refundA.id,
          approvedBy: 'admin-b',
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
