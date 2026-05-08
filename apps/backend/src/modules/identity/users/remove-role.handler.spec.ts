import { NotFoundException } from '@nestjs/common';
import { RemoveRoleHandler } from './remove-role.handler';

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('test-org-id'),
});

const buildPrisma = () => ({
  membership: { findFirst: jest.fn().mockResolvedValue({ id: 'mem_1' }) },
  user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
});

describe('RemoveRoleHandler', () => {
  it('clears customRoleId only when user actually has that role', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    await new RemoveRoleHandler(prisma as never, tenant as never).execute({
      userId: 'u-1', customRoleId: 'r-1',
    });
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-1', organizationId: 'test-org-id', isActive: true },
      select: { id: true },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-1', customRoleId: 'r-1' },
      data: { customRoleId: null },
    });
  });

  it('throws NotFoundException when user does not have the role assigned', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.user.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    await expect(
      new RemoveRoleHandler(prisma as never, tenant as never).execute({
        userId: 'u-1', customRoleId: 'r-2',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('blocks cross-tenant role removal when membership not found', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.membership.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      new RemoveRoleHandler(prisma as never, tenant as never).execute({
        userId: 'u-other-tenant', customRoleId: 'r-1',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
