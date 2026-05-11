import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GetOrganizationHandler } from './get-organization.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('GetOrganizationHandler', () => {
  let handler: GetOrganizationHandler;
  let orgFindUnique: jest.Mock;
  let membershipCount: jest.Mock;
  let bookingCount: jest.Mock;
  let invoiceAggregate: jest.Mock;

  beforeEach(async () => {
    orgFindUnique = jest.fn();
    membershipCount = jest.fn();
    bookingCount = jest.fn();
    invoiceAggregate = jest.fn();
    const prismaMock = {
      $allTenants: {
        organization: { findUnique: orgFindUnique },
        membership: { count: membershipCount },
        booking: { count: bookingCount },
        subscriptionInvoice: { aggregate: invoiceAggregate },
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetOrganizationHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    handler = moduleRef.get(GetOrganizationHandler);
  });

  it('returns org with aggregated stats', async () => {
    orgFindUnique.mockResolvedValue({
      id: 'o1',
      slug: 'a',
      nameAr: 'A',
      suspendedAt: null,
      memberships: [],
      vertical: null,
    });
    membershipCount.mockResolvedValue(7);
    bookingCount.mockResolvedValue(42);
    invoiceAggregate.mockResolvedValue({ _sum: { amount: 1500 } });

    const result = await handler.execute({ id: 'o1' });

    expect(result.id).toBe('o1');
    expect(result.stats).toEqual({
      memberCount: 7,
      bookingCount30d: 42,
      totalRevenue: 1500,
    });
  });

  it('throws NotFoundException when org does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);

    await expect(handler.execute({ id: 'missing' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('defaults totalRevenue to 0 when no PAID invoices', async () => {
    orgFindUnique.mockResolvedValue({
      id: 'o1',
      slug: 'a',
      memberships: [],
      vertical: null,
    });
    membershipCount.mockResolvedValue(0);
    bookingCount.mockResolvedValue(0);
    invoiceAggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await handler.execute({ id: 'o1' });

    expect(result.stats.totalRevenue).toBe(0);
  });
});
