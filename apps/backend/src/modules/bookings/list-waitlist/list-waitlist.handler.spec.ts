import { ListWaitlistHandler } from './list-waitlist.handler';
import { buildPrisma } from '../testing/booking-test-helpers';

describe('ListWaitlistHandler', () => {
  it('lists all waitlist entries', async () => {
    const prisma = buildPrisma();
    const entries = [{ id: 'wl-1', status: 'WAITING' }];
    prisma.waitlistEntry.findMany = jest.fn().mockResolvedValue(entries);
    const result = await new ListWaitlistHandler(prisma as never).execute({});
    expect(result).toEqual(entries);
    expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('filters by employeeId and status when provided', async () => {
    const prisma = buildPrisma();
    await new ListWaitlistHandler(prisma as never).execute({
      employeeId: 'emp-1', status: 'WAITING',
    });
    expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employeeId: 'emp-1', status: 'WAITING' },
      }),
    );
  });
});
