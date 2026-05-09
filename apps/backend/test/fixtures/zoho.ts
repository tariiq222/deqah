import type { PrismaService } from '../../../infrastructure/database';
import type { ZohoApiClient, ZohoIntegrationConfig } from '../../../infrastructure/zoho';

export const ZOHO_TEST_CONFIG: ZohoIntegrationConfig = {
  refreshToken: 'rt_test',
  zohoOrganizationId: 'zoho-test-org',
  dataCenter: 'sa',
  webhookSecret: 'wh-secret',
  defaults: { sendOnCreate: true },
};

export interface ZohoPrismaMock {
  zohoContactLink: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  zohoInvoiceLink: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  zohoCreditNoteLink: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  client: {
    findFirstOrThrow: jest.Mock;
  };
  invoice: {
    findFirstOrThrow: jest.Mock;
  };
  payment: {
    findFirstOrThrow: jest.Mock;
  };
  [key: string]: unknown;
}

export function createZohoPrismaMock(overrides: Partial<ZohoPrismaMock> = {}): ZohoPrismaMock {
  const defaults: ZohoPrismaMock = {
    zohoContactLink: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'link-c' }),
      update: jest.fn().mockResolvedValue({}),
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
        id: 'client-1',
        name: 'Ali Mohammed',
        firstName: 'Ali',
        lastName: 'Mohammed',
        email: 'ali@example.com',
        phone: '+966500000000',
      }),
    },
    invoice: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'inv-1',
        clientId: 'client-1',
        bookingId: 'bk-1',
        subtotal: 100,
        total: 115,
        currency: 'SAR',
        notes: 'Test booking',
      }),
    },
    payment: {
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'pay-1',
        amount: 115,
        method: 'ONLINE_CARD',
        gatewayRef: 'moy_charge_99',
        processedAt: new Date('2026-05-06'),
        createdAt: new Date('2026-05-06'),
      }),
    },
  };
  return { ...defaults, ...overrides } as ZohoPrismaMock;
}

export function createZohoApiMock(overrides: Partial<ZohoApiClient> = {}): ZohoApiClient {
  const defaults = {
    createContact: jest.fn().mockResolvedValue({
      contact: { contact_id: 'zc_99', contact_name: 'Ali' },
    }),
    createInvoice: jest.fn().mockResolvedValue({
      invoice: {
        invoice_id: 'zinv_99',
        invoice_number: 'INV-001',
        customer_id: 'zc_99',
        customer_name: 'Ali',
        status: 'sent',
        total: 115,
        balance: 115,
        currency_code: 'SAR',
        invoice_url: 'https://zoho/inv',
        pdf_url: 'https://zoho/inv.pdf',
      },
    }),
    recordCustomerPayment: jest.fn().mockResolvedValue({ payment: { payment_id: 'zpay_99' } }),
    sendInvoiceEmail: jest.fn().mockResolvedValue({ message: 'ok' }),
    createCreditNote: jest.fn().mockResolvedValue({
      creditnote: {
        creditnote_id: 'zcn_99',
        creditnote_number: 'CN-001',
        status: 'open',
        total: 115,
        balance: 0,
        customer_id: 'zc_99',
      },
    }),
    refundCreditNote: jest.fn().mockResolvedValue({}),
  };
  return { ...defaults, ...overrides } as unknown as ZohoApiClient;
}
