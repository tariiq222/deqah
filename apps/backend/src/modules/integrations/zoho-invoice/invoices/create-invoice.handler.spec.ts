import { CreateZohoInvoiceHandler } from './create-invoice.handler';
import type { UpsertContactHandler } from '../contacts/upsert-contact.handler';
import type { RecordPaymentHandler } from '../payments/record-payment.handler';
import type { PrismaService } from '../../../../infrastructure/database';
import type { ZohoApiClient, ZohoIntegrationConfig } from '../../../../infrastructure/zoho';

/**
 * CreateZohoInvoiceHandler is the engine that mirrors a paid Deqah invoice
 * into the tenant's Zoho organization. Tenant isolation requires:
 *
 *   - The idempotency lookup uses (organizationId, scope, deqahInvoiceId).
 *     Without organizationId in the key, a colliding invoice id from another
 *     tenant could short-circuit the create and silently leak status.
 *   - The Invoice load is scoped to organizationId.
 *   - The new ZohoInvoiceLink row carries the caller's organizationId.
 */
describe('CreateZohoInvoiceHandler — tenant isolation + idempotency', () => {
  const TENANT_A = 'org-A';
  const TENANT_B = 'org-B';
  const INVOICE_ID = 'inv-1';
  const BOOKING_ID = 'bk-1';

  const config: ZohoIntegrationConfig = {
    refreshToken: 'rt_A',
    zohoOrganizationId: 'zoho-A',
    dataCenter: 'sa',
    webhookSecret: 'w',
    defaults: { sendOnCreate: false },
  };

  function makeHandler() {
    const linkFindUnique = jest.fn();
    const linkCreate = jest.fn().mockResolvedValue({
      id: 'link-1',
      invoiceUrl: 'https://invoice.zoho.sa/inv/1',
    });
    const linkUpdate = jest.fn();
    const invoiceFindFirstOrThrow = jest.fn().mockResolvedValue({
      id: INVOICE_ID,
      clientId: 'client-1',
      bookingId: BOOKING_ID,
      subtotal: 100,
      total: 115,
      currency: 'SAR',
      notes: null,
    });
    const prisma = {
      zohoInvoiceLink: {
        findUnique: linkFindUnique,
        create: linkCreate,
        update: linkUpdate,
      },
      invoice: { findFirstOrThrow: invoiceFindFirstOrThrow },
    } as unknown as PrismaService;

    const createInvoice = jest.fn().mockResolvedValue({
      invoice: {
        invoice_id: 'zinv_1',
        invoice_number: 'INV-001',
        customer_id: 'zc_1',
        customer_name: 'X',
        status: 'sent',
        total: 115,
        balance: 115,
        currency_code: 'SAR',
        invoice_url: 'https://invoice.zoho.sa/inv/1',
      },
    });
    const sendInvoiceEmail = jest.fn().mockResolvedValue({ message: 'ok' });
    const api = { createInvoice, sendInvoiceEmail } as unknown as ZohoApiClient;

    const upsertContact = {
      execute: jest.fn().mockResolvedValue({ zohoContactId: 'zc_1' }),
    } as unknown as UpsertContactHandler;
    const recordPayment = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as RecordPaymentHandler;

    return {
      handler: new CreateZohoInvoiceHandler(prisma, api, upsertContact, recordPayment),
      linkFindUnique,
      linkCreate,
      invoiceFindFirstOrThrow,
      createInvoice,
      sendInvoiceEmail,
      upsertContact,
      recordPayment,
    };
  }

  it('keys the idempotency check by (organizationId, scope, deqahInvoiceId)', async () => {
    const { handler, linkFindUnique, linkCreate } = makeHandler();
    linkFindUnique.mockResolvedValue(null);

    await handler.execute({ organizationId: TENANT_A, invoiceId: INVOICE_ID, config });

    expect(linkFindUnique).toHaveBeenCalledWith({
      where: {
        zoho_link_org_scope_invoice: {
          organizationId: TENANT_A,
          scope: 'TENANT_CLIENT',
          deqahInvoiceId: INVOICE_ID,
        },
      },
    });
    expect(linkCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: TENANT_A,
        scope: 'TENANT_CLIENT',
        deqahInvoiceId: INVOICE_ID,
      }),
    });
  });

  it('returns the cached link without calling Zoho when an idempotent row exists', async () => {
    const { handler, linkFindUnique, linkCreate, createInvoice, upsertContact } = makeHandler();
    linkFindUnique.mockResolvedValue({
      id: 'link-existing',
      zohoInvoiceId: 'zinv_existing',
      invoiceUrl: 'https://...',
    });

    const result = await handler.execute({
      organizationId: TENANT_A,
      invoiceId: INVOICE_ID,
      config,
    });

    expect(result.zohoInvoiceId).toBe('zinv_existing');
    expect(createInvoice).not.toHaveBeenCalled();
    expect(linkCreate).not.toHaveBeenCalled();
    expect(upsertContact.execute).not.toHaveBeenCalled();
  });

  it('records the customer payment when paymentId is supplied (post-payment flow)', async () => {
    const { handler, linkFindUnique, recordPayment, linkCreate } = makeHandler();
    linkFindUnique.mockResolvedValue(null);

    await handler.execute({
      organizationId: TENANT_A,
      invoiceId: INVOICE_ID,
      config,
      paymentId: 'pay-1',
    });

    expect(recordPayment.execute).toHaveBeenCalledWith({
      organizationId: TENANT_A,
      config,
      zohoInvoiceId: 'zinv_1',
      zohoCustomerId: 'zc_1',
      paymentId: 'pay-1',
    });
    // Status stored as 'paid' once payment is recorded.
    expect(linkCreate.mock.calls[0]![0].data.status).toBe('paid');
  });

  it('does not record any payment when paymentId is omitted', async () => {
    const { handler, linkFindUnique, recordPayment, linkCreate } = makeHandler();
    linkFindUnique.mockResolvedValue(null);

    await handler.execute({ organizationId: TENANT_A, invoiceId: INVOICE_ID, config });

    expect(recordPayment.execute).not.toHaveBeenCalled();
    // status carried over from the Zoho create response.
    expect(linkCreate.mock.calls[0]![0].data.status).toBe('sent');
  });

  it('reads the Invoice scoped to the caller organizationId', async () => {
    const { handler, linkFindUnique, invoiceFindFirstOrThrow } = makeHandler();
    linkFindUnique.mockResolvedValue(null);

    await handler.execute({ organizationId: TENANT_B, invoiceId: INVOICE_ID, config });

    expect(invoiceFindFirstOrThrow).toHaveBeenCalledWith({
      where: { id: INVOICE_ID, organizationId: TENANT_B },
      select: expect.any(Object),
    });
    // double-check no leakage of A into a B-scoped flow.
    const createArgs = invoiceFindFirstOrThrow.mock.calls[0]![0];
    expect(createArgs.where.organizationId).not.toBe(TENANT_A);
  });

  it('only emails when defaults.sendOnCreate is true', async () => {
    const { handler, linkFindUnique, sendInvoiceEmail } = makeHandler();
    linkFindUnique.mockResolvedValue(null);

    await handler.execute({ organizationId: TENANT_A, invoiceId: INVOICE_ID, config });
    expect(sendInvoiceEmail).not.toHaveBeenCalled();

    const cfgWithEmail: ZohoIntegrationConfig = {
      ...config,
      defaults: { sendOnCreate: true },
    };
    linkFindUnique.mockResolvedValue(null);
    await handler.execute({
      organizationId: TENANT_A,
      invoiceId: INVOICE_ID,
      config: cfgWithEmail,
    });
    expect(sendInvoiceEmail).toHaveBeenCalledTimes(1);
  });

  it('email failure does not break invoice creation', async () => {
    const { handler, linkFindUnique, sendInvoiceEmail } = makeHandler();
    linkFindUnique.mockResolvedValue(null);
    sendInvoiceEmail.mockRejectedValue(new Error('mail server down'));

    const result = await handler.execute({
      organizationId: TENANT_A,
      invoiceId: INVOICE_ID,
      config: { ...config, defaults: { sendOnCreate: true } },
    });
    expect(result.zohoInvoiceId).toBe('zinv_1');
  });

  it('passes invoice_number = invoice.id in the Zoho create payload', async () => {
    const { handler, linkFindUnique, createInvoice } = makeHandler();
    linkFindUnique.mockResolvedValue(null);

    await handler.execute({ organizationId: TENANT_A, invoiceId: INVOICE_ID, config });

    expect(createInvoice).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ invoice_number: INVOICE_ID }),
      expect.any(Object),
    );
  });
});
