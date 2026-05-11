import type { INestApplication } from '@nestjs/common';
import { CancellationReason, PaymentMethod } from '@prisma/client';
import SuperTest from 'supertest';
import { MoyasarApiClient } from '../../src/modules/finance/moyasar-api/moyasar-api.client';
import { createTestApp, closeTestApp } from '../setup/app.setup';
import { createTestToken, adminUser, ensureTestUsers } from '../setup/auth.helper';
import { cleanTables, closePrisma, testPrisma } from '../setup/db.setup';
import {
  seedBranch,
  seedClient,
  seedEmployee,
  seedEmployeeAvailability,
  seedEmployeeService,
  seedService,
} from '../setup/seed.helper';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_WAIT_MS = 10_000;
const POLL_INTERVAL_MS = 100;
const FREE_CANCEL_BUFFER_MS = 72 * 60 * 60 * 1000;
const HALALAS_PER_RIYAL = 100;

const SMOKE_FLOW_TABLES = [
  'RefundRequest',
  'Payment',
  'Invoice',
  'BookingStatusLog',
  'Booking',
  'EmployeeService',
  'Client',
  'Employee',
  'Service',
  'Branch',
];

async function waitFor<T>(
  read: () => Promise<T>,
  isReady: (value: T) => boolean,
  label: string,
): Promise<T> {
  const startedAt = Date.now();
  let latest = await read();

  while (!isReady(latest)) {
    if (Date.now() - startedAt >= EVENT_WAIT_MS) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    latest = await read();
  }

  return latest;
}

describe('Booking payment cancellation smoke', () => {
  let app: INestApplication;
  let req: SuperTest.Agent;
  let token: string;
  let clientId: string;
  let employeeId: string;
  let serviceId: string;
  let branchId: string;
  let createRefundSpy: jest.SpiedFunction<MoyasarApiClient['createRefund']>;

  beforeAll(async () => {
    ({ app, request: req } = await createTestApp());
    await ensureTestUsers();
    await cleanTables(SMOKE_FLOW_TABLES);

    token = createTestToken(adminUser);

    const [client, employee, service, branch] = await Promise.all([
      seedClient(testPrisma),
      seedEmployee(testPrisma),
      seedService(testPrisma),
      seedBranch(testPrisma),
    ]);

    clientId = client.id;
    employeeId = employee.id;
    serviceId = service.id;
    branchId = branch.id;

    await seedEmployeeService(testPrisma, employeeId, serviceId);
    await seedEmployeeAvailability(testPrisma, employeeId);

    createRefundSpy = jest
      .spyOn(app.get(MoyasarApiClient), 'createRefund')
      .mockResolvedValue({
        id: 'moyasar-refund-smoke',
        amount: 0,
        currency: 'SAR',
        status: 'refunded',
        paymentId: 'moyasar-payment-smoke',
        createdAt: new Date().toISOString(),
      });
  }, 60_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await cleanTables(SMOKE_FLOW_TABLES);
    await closeTestApp();
    await closePrisma();
  });

  it('creates a booking, captures payment, cancels it, and finalizes the refund', async () => {
    const authHeader = { Authorization: `Bearer ${token}` };
    const scheduledAt = new Date(Date.now() + FREE_CANCEL_BUFFER_MS).toISOString();

    const bookingRes = await req
      .post('/dashboard/bookings')
      .set(authHeader)
      .send({
        branchId,
        clientId,
        employeeId,
        serviceId,
        scheduledAt,
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.status).toBe('PENDING');
    const bookingId = bookingRes.body.id as string;

    const confirmRes = await req
      .patch(`/dashboard/bookings/${bookingId}/confirm`)
      .set(authHeader);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('CONFIRMED');

    const invoice = await waitFor(
      () => testPrisma.invoice.findUnique({ where: { bookingId } }),
      (row) => row?.status === 'ISSUED',
      'booking invoice creation',
    );

    expect(invoice).not.toBeNull();
    const invoiceId = invoice!.id;
    const invoiceTotal = Number(invoice!.total);
    const gatewayRef = `moyasar-payment-smoke-${Date.now()}`;

    const paymentRes = await req
      .post('/dashboard/finance/payments')
      .set(authHeader)
      .send({
        invoiceId,
        amount: invoiceTotal,
        method: PaymentMethod.ONLINE_CARD,
        gatewayRef,
        idempotencyKey: `smoke-payment-${bookingId}`,
      });

    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.status).toBe('COMPLETED');
    const paymentId = paymentRes.body.id as string;

    const paidInvoice = await testPrisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(paidInvoice?.status).toBe('PAID');

    const cancelRes = await req
      .patch(`/dashboard/bookings/${bookingId}/cancel`)
      .set(authHeader)
      .send({
        reason: CancellationReason.CLIENT_REQUESTED,
        source: 'admin',
        cancelNotes: 'booking payment cancellation smoke',
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');
    expect(cancelRes.body.refundType).toBe('FULL');

    const refund = await waitFor(
      () => testPrisma.refundRequest.findFirst({ where: { paymentId } }),
      (row) => row?.status === 'COMPLETED',
      'booking cancellation refund finalization',
    );

    expect(refund).not.toBeNull();
    expect(Number(refund!.amount)).toBe(invoiceTotal);
    expect(refund!.gatewayRef).toBe('moyasar-refund-smoke');

    const [cancelledBooking, refundedPayment, refundedInvoice] = await Promise.all([
      testPrisma.booking.findUnique({ where: { id: bookingId } }),
      testPrisma.payment.findUnique({ where: { id: paymentId } }),
      testPrisma.invoice.findUnique({ where: { id: invoiceId } }),
    ]);

    expect(cancelledBooking?.status).toBe('CANCELLED');
    expect(cancelledBooking?.cancelledAt).not.toBeNull();
    expect(refundedPayment?.status).toBe('REFUNDED');
    expect(Number(refundedPayment?.refundedAmount ?? 0)).toBe(invoiceTotal);
    expect(refundedInvoice?.status).toBe('REFUNDED');
    expect(createRefundSpy).toHaveBeenCalledWith(DEFAULT_ORG_ID, {
      paymentId: gatewayRef,
      amount: Math.round(invoiceTotal * HALALAS_PER_RIYAL),
      idempotencyKey: `refund:${paymentId}:${invoiceTotal.toFixed(2)}`,
    });
  }, 60_000);
});
