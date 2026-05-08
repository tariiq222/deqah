import { NotFoundException } from '@nestjs/common';
import { DeleteUserHandler } from './delete-user.handler';

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('test-org-id'),
});

const buildPrisma = () => ({
  membership: { findFirst: jest.fn().mockResolvedValue({ id: 'mem_1' }) },
  user: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
});

describe('DeleteUserHandler', () => {
  it('deletes a user', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    await new DeleteUserHandler(prisma as never, tenant as never).execute({ userId: 'u-1' });
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-1', organizationId: 'test-org-id', isActive: true },
      select: { id: true },
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'u-1' },
    });
  });

  it('throws NotFoundException when user does not exist', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.user.deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    await expect(
      new DeleteUserHandler(prisma as never, tenant as never).execute({ userId: 'missing' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('blocks cross-tenant delete when membership not found', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.membership.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      new DeleteUserHandler(prisma as never, tenant as never).execute({ userId: 'u-other-tenant' }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });
});
