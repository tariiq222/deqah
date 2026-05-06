import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AddToWaitlistHandler } from './add-to-waitlist.handler';
import { buildPrisma, buildTenant } from '../testing/booking-test-helpers';

describe('AddToWaitlistHandler', () => {
  it('adds client to waitlist', async () => {
    const prisma = buildPrisma();
    const result = await new AddToWaitlistHandler(prisma as never, buildTenant() as never).execute({
      clientId: 'client-1', employeeId: 'emp-1',
      serviceId: 'svc-1', branchId: 'branch-1',
    });
    expect(result.status).toBe('WAITING');
  });

  it('throws ConflictException when already on waitlist', async () => {
    const prisma = buildPrisma();
    prisma.waitlistEntry.findFirst = jest.fn().mockResolvedValue({ id: 'wl-1' });
    await expect(
      new AddToWaitlistHandler(prisma as never, buildTenant() as never).execute({
        clientId: 'client-1', employeeId: 'emp-1',
        serviceId: 'svc-1', branchId: 'branch-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when DB raises P2002 (TOCTOU race)', async () => {
    const prisma = buildPrisma();
    // findFirst returns null (race: both requests passed the pre-check)
    prisma.waitlistEntry.findFirst = jest.fn().mockResolvedValue(null);
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'x',
      meta: { target: ['WaitlistEntry_org_client_employee_service_waiting_unique'] },
    });
    prisma.waitlistEntry.create = jest.fn().mockRejectedValue(p2002);
    await expect(
      new AddToWaitlistHandler(prisma as never, buildTenant() as never).execute({
        clientId: 'client-1', employeeId: 'emp-1',
        serviceId: 'svc-1', branchId: 'branch-1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
