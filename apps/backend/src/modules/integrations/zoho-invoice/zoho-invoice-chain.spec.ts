/**
 * Zoho Invoice integration chain test.
 *
 * Tests the full tenant→client flow WITHOUT hitting real Zoho servers:
 *   payment.captured → create contact → create invoice → record payment
 *   → refund.completed → create credit-note → refund posting
 *
 * All Zoho HTTP calls are mocked at the ZohoApiClient level. Prisma calls
 * are mocked at the PrismaService level. Handlers are composed manually
 * (no NestJS DI) — this proves the handler chain assembles correctly and
 * passes the right data between steps.
 */
import type { PrismaService } from '../../../infrastructure/database';
import type { ZohoApiClient } from '../../../infrastructure/zoho';
import { UpsertContactHandler } from './contacts/upsert-contact.handler';
import { CreateZohoInvoiceHandler } from './invoices/create-invoice.handler';
import { RecordPaymentHandler } from './payments/record-payment.handler';
import { CreateCreditNoteHandler } from './credit-notes/create-credit-note.handler';
import { createZohoPrismaMock, createZohoApiMock, ZOHO_TEST_CONFIG } from '../../../../test/fixtures/zoho';

const TENANT = 'org-chain-test';
const CLIENT_ID = 'client-1';
const INVOICE_ID = 'inv-1';
const PAYMENT_ID = 'pay-1';
const BOOKING_ID = 'bk-1';
const REFUND_ID = 'rfnd-1';
const ZOHO_CONTACT_ID = 'zc_99';
const ZOHO_INVOICE_ID = 'zinv_99';
const ZOHO_CREDIT_NOTE_ID = 'zcn_99';

describe('Zoho Invoice — full chain integration', () => {
  it('payment.captured → contact → invoice → payment → email', async () => {
    const prisma = createZohoPrismaMock();
    const api = createZohoApiMock();
    const upsert = new UpsertContactHandler(prisma as unknown as PrismaService, api);
    const recordPay = new RecordPaymentHandler(prisma as unknown as PrismaService, api);
    const createInv = new CreateZohoInvoiceHandler(prisma as unknown as PrismaService, api, upsert, recordPay);

    const result = await createInv.execute({
      organizationId: TENANT, invoiceId: INVOICE_ID, paymentId: PAYMENT_ID, config: ZOHO_TEST_CONFIG,
    });

    expect(api.createContact).toHaveBeenCalledTimes(1);
    expect(prisma.zohoContactLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: TENANT, deqahPersonId: CLIENT_ID, zohoContactId: ZOHO_CONTACT_ID }),
    });
    expect(api.createInvoice).toHaveBeenCalledTimes(1);
    expect(result.zohoInvoiceId).toBe(ZOHO_INVOICE_ID);
    expect(api.recordCustomerPayment).toHaveBeenCalledWith(
      expect.objectContaining({ zohoOrganizationId: 'zoho-test-org' }),
      expect.objectContaining({
        customer_id: ZOHO_CONTACT_ID, payment_mode: 'creditcard', amount: 115,
        reference_number: 'moy_charge_99',
        invoices: [{ invoice_id: ZOHO_INVOICE_ID, amount_applied: 115 }],
      }),
    );
    expect(api.sendInvoiceEmail).toHaveBeenCalledWith(expect.any(Object), ZOHO_INVOICE_ID, {});
    expect(prisma.zohoInvoiceLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: TENANT, scope: 'TENANT_CLIENT', deqahInvoiceId: INVOICE_ID,
        zohoInvoiceId: ZOHO_INVOICE_ID, status: 'paid', total: 115, currency: 'SAR',
      }),
    });
  });

  it('refund.completed → credit-note → refund posting → link persisted', async () => {
    const prisma = createZohoPrismaMock({
      zohoInvoiceLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'link-existing', zohoCustomerId: ZOHO_CONTACT_ID, zohoInvoiceId: ZOHO_INVOICE_ID, currency: 'SAR',
        }),
        create: jest.fn().mockResolvedValue({ id: 'link-cn' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const api = createZohoApiMock();
    const handler = new CreateCreditNoteHandler(prisma as unknown as PrismaService, api);

    const result = await handler.execute({
      organizationId: TENANT, config: ZOHO_TEST_CONFIG, refundRequestId: REFUND_ID,
      invoiceId: INVOICE_ID, amount: 115, reason: 'Client requested', gatewayRef: 'moy_refund_99',
    });

    expect(result?.zohoCreditNoteId).toBe(ZOHO_CREDIT_NOTE_ID);
    expect(api.createCreditNote).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        customer_id: ZOHO_CONTACT_ID, reference_invoice_id: ZOHO_INVOICE_ID,
        line_items: [expect.objectContaining({ rate: 115, quantity: 1 })],
      }),
    );
    expect(api.refundCreditNote).toHaveBeenCalledWith(
      expect.any(Object), ZOHO_CREDIT_NOTE_ID,
      expect.objectContaining({ amount: 115, reference_number: 'moy_refund_99' }),
    );
    expect(prisma.zohoCreditNoteLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: TENANT, zohoCreditNoteId: ZOHO_CREDIT_NOTE_ID, deqahRefundRequestId: REFUND_ID,
      }),
    });
  });

  it('second invoice create for same (org, scope, invoiceId) returns cached link', async () => {
    const prisma = createZohoPrismaMock({
      zohoInvoiceLink: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'cached', zohoInvoiceId: ZOHO_INVOICE_ID, invoiceUrl: 'https://cached' }),
        create: jest.fn().mockResolvedValue({ id: 'link-i', invoiceUrl: 'https://zoho/inv' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const api = createZohoApiMock();
    const upsert = new UpsertContactHandler(prisma as unknown as PrismaService, api);
    const recordPay = new RecordPaymentHandler(prisma as unknown as PrismaService, api);
    const createInv = new CreateZohoInvoiceHandler(prisma as unknown as PrismaService, api, upsert, recordPay);

    await createInv.execute({ organizationId: TENANT, invoiceId: INVOICE_ID, paymentId: PAYMENT_ID, config: ZOHO_TEST_CONFIG });
    const second = await createInv.execute({ organizationId: TENANT, invoiceId: INVOICE_ID, config: ZOHO_TEST_CONFIG });

    expect(second.zohoInvoiceId).toBe(ZOHO_INVOICE_ID);
    expect(api.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('all DB lookups pass the correct tenant organizationId', async () => {
    const seen: string[] = [];
    const prisma = createZohoPrismaMock({
      client: {
        findFirstOrThrow: jest.fn().mockImplementation((args: { where: { organizationId: string } }) => {
          seen.push(args.where.organizationId);
          return { id: CLIENT_ID, name: 'Ali Mohammed', firstName: 'Ali', lastName: 'Mohammed', email: 'ali@example.com', phone: '+966500000000' };
        }),
      },
      invoice: {
        findFirstOrThrow: jest.fn().mockImplementation((args: { where: { organizationId: string } }) => {
          seen.push(args.where.organizationId);
          return { id: INVOICE_ID, clientId: CLIENT_ID, bookingId: BOOKING_ID, subtotal: 100, total: 115, currency: 'SAR', notes: 'Test booking' };
        }),
      },
      payment: {
        findFirstOrThrow: jest.fn().mockImplementation((args: { where: { organizationId: string } }) => {
          seen.push(args.where.organizationId);
          return { id: PAYMENT_ID, amount: 115, method: 'ONLINE_CARD', gatewayRef: 'moy_charge_99', processedAt: new Date('2026-05-06'), createdAt: new Date('2026-05-06') };
        }),
      },
    });
    const api = createZohoApiMock();
    const upsert = new UpsertContactHandler(prisma as unknown as PrismaService, api);
    const recordPay = new RecordPaymentHandler(prisma as unknown as PrismaService, api);
    const createInv = new CreateZohoInvoiceHandler(prisma as unknown as PrismaService, api, upsert, recordPay);

    await createInv.execute({ organizationId: TENANT, invoiceId: INVOICE_ID, paymentId: PAYMENT_ID, config: ZOHO_TEST_CONFIG });

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.every((id) => id === TENANT)).toBe(true);
  });
});
