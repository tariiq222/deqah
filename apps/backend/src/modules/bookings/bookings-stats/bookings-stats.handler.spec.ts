import { Prisma } from '@prisma/client';
import { BookingsStatsHandler } from './bookings-stats.handler';

// Tenant scoping is enforced by the auto-scoping Prisma extension
// (`buildTenantScopingExtension`), which injects `organizationId` into every
// `where` of count/aggregate calls on SCOPED_MODELS. `Booking` is in that set,
// so this handler does not need to filter by organizationId in user code —
// the contract is verified end-to-end by `test/e2e/security/cross-tenant-penetration`.
// This spec covers shape + math.

describe('BookingsStatsHandler', () => {
  const buildPrisma = () => ({
    booking: {
      count: jest
        .fn()
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(3),
      aggregate: jest.fn().mockResolvedValue({ _sum: { price: new Prisma.Decimal(45000) } }),
    },
  });

  it('returns todayCount, pendingCount, completedToday, revenueToday', async () => {
    const prisma = buildPrisma();
    const handler = new BookingsStatsHandler(prisma as never);
    const result = await handler.execute();
    expect(result).toEqual({
      todayCount: 5,
      pendingCount: 7,
      completedToday: 3,
      revenueToday: 450, // 45000 halalas / 100 = 450 SAR
    });
  });

  it('handles null revenue (no completed bookings yet)', async () => {
    const prisma = buildPrisma();
    prisma.booking.aggregate = jest.fn().mockResolvedValue({ _sum: { price: null } });
    const handler = new BookingsStatsHandler(prisma as never);
    const result = await handler.execute();
    expect(result.revenueToday).toBe(0);
  });
});
