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
import type { ZohoApiClient, ZohoIntegrationConfig } from '../../../infrastructure/zoho';
import { UpsertContactHandler } from './contacts/upsert-contact.handler';
import { CreateZohoInvoiceHandler } from './invoices/create-invoice.handler';
import { RecordPaymentHandler } from './payments/record-payment.handler';
import { CreateCreditNoteHandler } from './credit-notes/create-credit-note.handler';

const TENANT = 'org-chain-test';
const CLIENT_ID = 'client-1';
const INVOICE_ID = 'inv-1';
const PAYMENT_ID = 'pay-1';
const BOOKING_ID = 'bk-1';
const REFUND_ID = 'rfnd-1';
const ZOHO_CONTACT_ID = 'zc_99';
const ZOHO_INVOICE_ID = 'zinv_99';
const ZOHO_CREDIT_NOTE_ID = 'zcn_99';

const CONFIG: ZohoIntegrationConfig = {
  refreshToken: 'rt_test',
  zohoOrganizationId: 'zoho-test-org',
  dataCenter: 'sa',
  webhookSecret: 'wh-secret',
  defaults: { sendOnCreate: true },
};

function makePrisma() {
  return {
    zohoContactLink: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'link-c' }),
    },
    zohoInvoiceLink: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'link-i', invoiceUrl: 'https://zoho/inv' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    zohoCreditNoteLink: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'link-cn' }),
    },
    client: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: CLIENT_ID, name: 'Ali Mohammed', firstName: 'Ali', lastName: 'Mohammed',
        email: 'ali@example.com', phone: '+966500000000',
      }),
    },
    invoice: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: INVOICE_ID, clientId: CLIENT_ID, bookingId: BOOKING_ID,
        subtotal: 100, total: 115, currency: 'SAR', notes: 'Test booking',
      }),
    },
    payment: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: PAYMENT_ID, amount: 115, method: 'ONLINE_CARD', gatewayRef: 'moy_charge_99',
        processedAt: new Date('2026-05-06'), createdAt: new Date('2026-05-06'),
      }),
    },
  } as unknown as PrismaService;
}

function makeApi() {
  return {
    createContact: jest.fn().mockResolvedValue({
      contact: { contact_id: ZOHO_CONTACT_ID, contact_name: 'Ali' },
    }),
    createInvoice: jest.fn().mockResolvedValue({
      invoice: {
        invoice_id: ZOHO_INVOICE_ID, invoice_number: 'INV-001', customer_id: ZOHO_CONTACT_ID,
        customer_name: 'Ali', status: 'sent', total: 115, balance: 115,
        currency_code: 'SAR', invoice_url: 'https://zoho/inv', pdf_url: 'https://zoho/inv.pdf',
      },
    }),
    recordCustomerPayment: jest.fn().mockResolvedValue({ payment: { payment_id: 'zpay_99' } }),
    sendInvoiceEmail: jest.fn().mockResolvedValue({ message: 'ok' }),
    createCreditNote: jest.fn().mockResolvedValue({
      creditnote: {
        creditnote_id: ZOHO_CREDIT_NOTE_ID, creditnote_number: 'CN-001', status: 'open',
        total: 115, balance: 0, customer_id: ZOHO_CONTACT_ID,
      },
    }),
    refundCreditNote: jest.fn().mockResolvedValue({}),
  } as unknown as ZohoApiClient;
}

describe('Zoho Invoice — full chain integration', () => {
  it('payment.captured → contact → invoice → payment → email', async () => {
    const prisma = makePrisma();
    const api = makeApi();
    const upsert = new UpsertContactHandler(prisma, api);
    const recordPay = new RecordPaymentHandler(prisma, api);
    const createInv = new CreateZohoInvoiceHandler(prisma, api, upsert, recordPay);

    const result = await createInv.execute({
      organizationId: TENANT, invoiceId: INVOICE_ID, paymentId: PAYMENT_ID, config: CONFIG,
    });

    // Contact created
    expect(api.createContact).toHaveBeenCalledTimes(1);
    expect(prisma.zohoContactLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: TENANT, deqahPersonId: CLIENT_ID, zohoContactId: ZOHO_CONTACT_ID }),
    });
    // Invoice created
    expect(api.createInvoice).toHaveBeenCalledTimes(1);
    expect(result.zohoInvoiceId).toBe(ZOHO_INVOICE_ID);
    // Payment recorded against the new invoice
    expect(api.recordCustomerPayment).toHaveBeenCalledWith(
      expect.objectContaining({ zohoOrganizationId: 'zoho-test-org' }),
      expect.objectContaining({
        customer_id: ZOHO_CONTACT_ID, payment_mode: 'creditcard', amount: 115,
        reference_number: 'moy_charge_99',
        invoices: [{ invoice_id: ZOHO_INVOICE_ID, amount_applied: 115 }],
      }),
    );
    // Email sent (sendOnCreate=true)
    expect(api.sendInvoiceEmail).toHaveBeenCalledWith(expect.any(Object), ZOHO_INVOICE_ID, {});
    // Link persisted as paid
    expect(prisma.zohoInvoiceLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: TENANT, scope: 'TENANT_CLIENT', deqahInvoiceId: INVOICE_ID,
        zohoInvoiceId: ZOHO_INVOICE_ID, status: 'paid', total: 115, currency: 'SAR',
      }),
    });
  });

  it('refund.completed → credit-note → refund posting → link persisted', async () => {
    const prisma = makePrisma();
    const api = makeApi();
    (prisma.zohoInvoiceLink.findUnique as jest.Mock).mockResolvedValue({
      id: 'link-existing', zohoCustomerId: ZOHO_CONTACT_ID, zohoInvoiceId: ZOHO_INVOICE_ID, currency: 'SAR',
    });
    const handler = new CreateCreditNoteHandler(prisma, api);

    const result = await handler.execute({
      organizationId: TENANT, config: CONFIG, refundRequestId: REFUND_ID,
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
    const prisma = makePrisma();
    const api = makeApi();
    const upsert = new UpsertContactHandler(prisma, api);
    const recordPay = new RecordPaymentHandler(prisma, api);
    const createInv = new CreateZohoInvoiceHandler(prisma, api, upsert, recordPay);

    (prisma.zohoInvoiceLink.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'cached', zohoInvoiceId: ZOHO_INVOICE_ID, invoiceUrl: 'https://cached' });

    await createInv.execute({ organizationId: TENANT, invoiceId: INVOICE_ID, paymentId: PAYMENT_ID, config: CONFIG });
    const second = await createInv.execute({ organizationId: TENANT, invoiceId: INVOICE_ID, config: CONFIG });

    expect(second.zohoInvoiceId).toBe(ZOHO_INVOICE_ID);
    expect(api.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('all DB lookups pass the correct tenant organizationId', async () => {
    const prisma = makePrisma();
    const api = makeApi();
    const seen: string[] = [];
    for (const model of ['client', 'invoice', 'payment'] as const) {
      (prisma[model].findFirstOrThrow as jest.Mock).mockImplementation((args: { where: { organizationId: string } }) => {
        seen.push(args.where.organizationId);
        return (makePrisma()[model].findFirstOrThrow as jest.Mock)();
      });
    }
    const upsert = new UpsertContactHandler(prisma, api);
    const recordPay = new RecordPaymentHandler(prisma, api);
    const createInv = new CreateZohoInvoiceHandler(prisma, api, upsert, recordPay);

    await createInv.execute({ organizationId: TENANT, invoiceId: INVOICE_ID, paymentId: PAYMENT_ID, config: CONFIG });

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.every((id) => id === TENANT)).toBe(true);
  });
});
