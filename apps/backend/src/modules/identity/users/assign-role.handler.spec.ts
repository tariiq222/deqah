import { NotFoundException } from '@nestjs/common';
import { AssignRoleHandler } from './assign-role.handler';

const buildTenant = () => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue('test-org-id'),
});

const buildPrisma = () => ({
  membership: { findFirst: jest.fn().mockResolvedValue({ id: 'mem_1' }) },
  customRole: { findFirst: jest.fn().mockResolvedValue({ id: 'r-1' }) },
  user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
});

describe('AssignRoleHandler', () => {
  it('assigns customRoleId to user', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    await new AssignRoleHandler(prisma as never, tenant as never).execute({
      userId: 'u-1', customRoleId: 'r-1',
    });
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-1', organizationId: 'test-org-id', isActive: true },
      select: { id: true },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { customRoleId: 'r-1' },
    });
  });

  it('throws NotFoundException when role not found', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.customRole.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      new AssignRoleHandler(prisma as never, tenant as never).execute({
        userId: 'u-1', customRoleId: 'missing',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.user.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    await expect(
      new AssignRoleHandler(prisma as never, tenant as never).execute({
        userId: 'missing', customRoleId: 'r-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('blocks cross-tenant assign when membership not found', async () => {
    const prisma = buildPrisma();
    const tenant = buildTenant();
    prisma.membership.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      new AssignRoleHandler(prisma as never, tenant as never).execute({
        userId: 'u-other-tenant', customRoleId: 'r-1',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
