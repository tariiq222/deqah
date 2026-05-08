import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeactivateUserHandler } from './deactivate-user.handler';

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('test-org-id'),
});

const buildPrisma = () => ({
  membership: { findFirst: jest.fn().mockResolvedValue({ id: 'mem_1' }) },
  user: {
    findUnique: jest.fn().mockResolvedValue({ id: 'u-1', isActive: true }),
    update: jest.fn().mockResolvedValue({ id: 'u-1', isActive: false }),
  },
  $allTenants: {
    membership: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
  },
});

describe('DeactivateUserHandler', () => {
  it('deactivates a user', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    await new DeactivateUserHandler(prisma as never, tenant as never).execute({ userId: 'u-1' });
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-1', organizationId: 'test-org-id', isActive: true },
      select: { id: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { isActive: false },
    });
  });

  it('throws NotFoundException when user not found', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.user.findUnique = jest.fn().mockResolvedValue(null);
    await expect(
      new DeactivateUserHandler(prisma as never, tenant as never).execute({ userId: 'missing' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when deactivating last OWNER', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.$allTenants.membership.findMany = jest.fn().mockResolvedValue([
      { id: 'own-1', organizationId: 'org-1' },
    ]);
    prisma.$allTenants.membership.count = jest.fn().mockResolvedValue(0);
    await expect(
      new DeactivateUserHandler(prisma as never, tenant as never).execute({ userId: 'u-1' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks cross-tenant deactivate when membership not found', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.membership.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      new DeactivateUserHandler(prisma as never, tenant as never).execute({ userId: 'u-other-tenant' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
