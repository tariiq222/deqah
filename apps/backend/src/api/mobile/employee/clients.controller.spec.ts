import { MobileEmployeeClientsController } from './clients.controller';

const USER = { sub: 'user-1' };
const EMPLOYEE = { id: 'emp-1' };

function mockPrisma(overrides: Partial<{
  employeeFindFirst: jest.Mock;
  bookingFindMany: jest.Mock;
  clientFindMany: jest.Mock;
  count: jest.Mock;
}> = {}) {
  return {
    employee: {
      findFirst: overrides.employeeFindFirst ?? jest.fn().mockResolvedValue(EMPLOYEE),
    },
    booking: {
      findMany: overrides.bookingFindMany ?? jest.fn().mockResolvedValue([]),
    },
    client: {
      findMany: overrides.clientFindMany ?? jest.fn().mockResolvedValue([]),
      count: overrides.count ?? jest.fn().mockResolvedValue(0),
    },
  };
}

describe('MobileEmployeeClientsController', () => {
  describe('listMyClients', () => {
    it('resolves the Employee record from the authenticated user before querying bookings', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.listMyClients(USER as never, {} as never);
      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: { userId: USER.sub, isActive: true },
        select: { id: true },
      });
      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: { employeeId: EMPLOYEE.id },
        select: { clientId: true },
        distinct: ['clientId'],
      });
    });

    it('uses employeeId from the token when present', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.listMyClients({ ...USER, employeeId: 'emp-token' } as never, {} as never);
      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: 'emp-token' } }),
      );
    });

    it('rejects authenticated users without a linked active employee profile', async () => {
      const prisma = mockPrisma({
        employeeFindFirst: jest.fn().mockResolvedValue(null),
      });
      const controller = new MobileEmployeeClientsController(prisma as never);

      await expect(controller.listMyClients(USER as never, {} as never)).rejects.toMatchObject({
        message: 'employee_profile_not_found',
      });
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });

    it('returns clients with pagination meta', async () => {
      const prisma = mockPrisma({
        bookingFindMany: jest.fn().mockResolvedValue([{ clientId: 'c-1' }]),
        clientFindMany: jest.fn().mockResolvedValue([{ id: 'c-1', name: 'Ahmed' }]),
        count: jest.fn().mockResolvedValue(1),
      });
      const controller = new MobileEmployeeClientsController(prisma as never);
      const result = await controller.listMyClients(USER as never, {} as never);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta.total).toBe(1);
    });

    it('defaults page to 1 and limit to 20', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.listMyClients(USER as never, {} as never);
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('applies custom page and limit', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.listMyClients(USER as never, { page: 3, limit: 10 } as never);
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('searches by name when search param is provided', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.listMyClients(USER as never, { search: 'Ahmed' } as never);
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'Ahmed', mode: 'insensitive' }) }),
            ]),
          }),
        }),
      );
    });

    it('searches by phone when search param is provided', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.listMyClients(USER as never, { search: '0500' } as never);
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ phone: expect.objectContaining({ contains: '0500', mode: 'insensitive' }) }),
            ]),
          }),
        }),
      );
    });

    it('orders clients by name ascending', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.listMyClients(USER as never, {} as never);
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });

    it('includes correct totalPages in meta', async () => {
      const prisma = mockPrisma({
        clientFindMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(45),
      });
      const controller = new MobileEmployeeClientsController(prisma as never);
      const result = await controller.listMyClients(USER as never, {} as never);
      expect(result.meta.totalPages).toBe(3); // 45 / 20 = 2.25 -> ceil = 3
    });
  });

  describe('clientHistory', () => {
    it('fetches bookings for the given clientId with the linked employee id', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.clientHistory(USER as never, 'c-1');
      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: { employeeId: EMPLOYEE.id, clientId: 'c-1' },
        orderBy: { scheduledAt: 'desc' },
        take: 20,
      });
    });

    it('rejects history requests for authenticated users without a linked employee profile', async () => {
      const prisma = mockPrisma({
        employeeFindFirst: jest.fn().mockResolvedValue(null),
      });
      const controller = new MobileEmployeeClientsController(prisma as never);

      await expect(controller.clientHistory(USER as never, 'c-1')).rejects.toMatchObject({
        message: 'employee_profile_not_found',
      });
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });

    it('returns bookings ordered by scheduledAt desc', async () => {
      const prisma = mockPrisma({
        bookingFindMany: jest.fn().mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }]),
      });
      const controller = new MobileEmployeeClientsController(prisma as never);
      const result = await controller.clientHistory(USER as never, 'c-1');
      expect(result).toHaveLength(2);
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { scheduledAt: 'desc' } }),
      );
    });

    it('limits results to 20 bookings', async () => {
      const prisma = mockPrisma();
      const controller = new MobileEmployeeClientsController(prisma as never);
      await controller.clientHistory(USER as never, 'c-1');
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });
  });
});
