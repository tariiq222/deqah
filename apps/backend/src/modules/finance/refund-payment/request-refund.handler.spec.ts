import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { RequestRefundHandler } from './request-refund.handler';

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
});

const mockCompletedPayment = {
  id: 'pay-1',
  amount: 230,
  status: 'COMPLETED',
  processedAt: new Date(),
};

const mockInvoice = {
  id: 'inv-1',
  clientId: 'client-1',
  status: 'PAID',
  payments: [mockCompletedPayment],
};

const buildPrisma = () => ({
  invoice: {
    findFirst: jest.fn().mockResolvedValue(mockInvoice),
  },
  refundRequest: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      id: 'refund-1',
      status: 'PENDING_REVIEW',
      amount: 230,
      createdAt: new Date('2026-04-21T00:00:00.000Z'),
    }),
  },
});

const cmd = { invoiceId: 'inv-1', clientId: 'client-1', reason: 'Changed my mind' };

describe('RequestRefundHandler', () => {
  it('creates a refund request for a paid invoice', async () => {
    const prisma = buildPrisma();
    const handler = new RequestRefundHandler(prisma as never, buildTenant() as never);

    const result = await handler.execute(cmd);

    expect(prisma.refundRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: '00000000-0000-0000-0000-000000000001',
          invoiceId: 'inv-1',
          paymentId: 'pay-1',
          clientId: 'client-1',
          status: 'PENDING_REVIEW',
        }),
      }),
    );
    expect(result.id).toBe('refund-1');
    expect(result.status).toBe('PENDING_REVIEW');
    expect(result.amount).toBe(230);
  });

  it('throws NotFoundException when invoice not found', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new RequestRefundHandler(prisma as never, buildTenant() as never);

    await expect(handler.execute(cmd)).rejects.toThrow(NotFoundException);
    expect(prisma.refundRequest.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when invoice is not PAID', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findFirst = jest.fn().mockResolvedValue({ ...mockInvoice, status: 'ISSUED' });
    const handler = new RequestRefundHandler(prisma as never, buildTenant() as never);

    await expect(handler.execute(cmd)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when no completed payment found', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findFirst = jest.fn().mockResolvedValue({ ...mockInvoice, payments: [] });
    const handler = new RequestRefundHandler(prisma as never, buildTenant() as never);

    await expect(handler.execute(cmd)).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException when refund request already exists', async () => {
    const prisma = buildPrisma();
    prisma.refundRequest.findFirst = jest.fn().mockResolvedValue({ id: 'existing-refund', status: 'PENDING_REVIEW' });
    const handler = new RequestRefundHandler(prisma as never, buildTenant() as never);

    await expect(handler.execute(cmd)).rejects.toThrow(ConflictException);
  });

  it('does not find refund request from different organizationId', async () => {
    const prisma = buildPrisma();
    const tenantOrgA = { requireOrganizationIdOrDefault: jest.fn().mockReturnValue('org-A') };
    const tenantOrgB = { requireOrganizationIdOrDefault: jest.fn().mockReturnValue('org-B') };

    prisma.refundRequest.findFirst = jest.fn().mockResolvedValue(null);
    const handlerOrgA = new RequestRefundHandler(prisma as never, tenantOrgA as never);
    const handlerOrgB = new RequestRefundHandler(prisma as never, tenantOrgB as never);

    const cmdOrgA = { invoiceId: 'inv-1', clientId: 'client-1', reason: 'Changed my mind' };

    await handlerOrgA.execute(cmdOrgA);

    expect(prisma.refundRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-A',
        }),
      }),
    );
  });
});
