import { ConflictException, NotFoundException } from '@nestjs/common';
import { CreateUserHandler } from './create-user.handler';
import { DeactivateUserHandler } from './deactivate-user.handler';
import { GetUserHandler } from './get-user.handler';
import { ListUsersHandler } from './list-users.handler';
import { UpdateUserHandler } from './update-user.handler';
import { RlsTransactionService } from '../../../infrastructure/database';

const buildUsersPrisma = () => {
  const prisma = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u-1', name: 'Ahmad', isActive: true }),
      findFirst: jest.fn().mockResolvedValue({ id: 'u-1', email: 'a@clinic.sa', name: 'Ahmad', isActive: true }),
      create: jest.fn().mockResolvedValue({ id: 'u-1', email: 'a@clinic.sa', name: 'Ahmad' }),
      update: jest.fn().mockResolvedValue({ id: 'u-1', name: 'Updated', isActive: false }),
      findMany: jest.fn().mockResolvedValue([{ id: 'u-1' }]),
      count: jest.fn().mockResolvedValue(1),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue({ id: 'mem_1' }),
      upsert: jest.fn().mockResolvedValue({ id: 'm-1', userId: 'u-1', organizationId: 'org-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $allTenants: {
      membership: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
      },
    },
  };
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
  return prisma;
};

const buildTenantCtx = (organizationId = 'org-1') => ({
  requireOrganizationId: jest.fn().mockReturnValue(organizationId),
});

const buildDeactivateTenant = (organizationId = 'org-1') => ({
  requireOrganizationIdOrDefault: jest.fn().mockReturnValue(organizationId),
});
const buildRlsTx = (prisma: ReturnType<typeof buildUsersPrisma>) =>
  ({
    withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  } as unknown as RlsTransactionService);

describe('CreateUserHandler', () => {
  it('creates user with hashed password and active tenant membership', async () => {
    const prisma = buildUsersPrisma();
    prisma.user.findUnique = jest.fn().mockResolvedValue(null);
    const passwordService = { hash: jest.fn().mockResolvedValue('hashed') };
    const tenantCtx = buildTenantCtx('org-1');
    const handler = new CreateUserHandler(prisma as never, passwordService as never, tenantCtx as never, buildRlsTx(prisma));
    const result = await handler.execute({
      email: 'a@b.com', password: 'pass123', name: 'Ali', role: 'RECEPTIONIST' as never,
    });
    expect(result.id).toBe('u-1');
    expect(tenantCtx.requireOrganizationId).toHaveBeenCalled();
    expect(prisma.membership.upsert).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'u-1', organizationId: 'org-1' } },
      create: {
        userId: 'u-1',
        organizationId: 'org-1',
        role: 'RECEPTIONIST',
        isActive: true,
        acceptedAt: expect.any(Date),
      },
      update: {
        role: 'RECEPTIONIST',
        isActive: true,
        acceptedAt: expect.any(Date),
      },
    });
  });

  it('throws ConflictException when email already taken', async () => {
    const prisma = buildUsersPrisma();
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'existing' });
    const passwordService = { hash: jest.fn().mockResolvedValue('hashed') };
    const handler = new CreateUserHandler(prisma as never, passwordService as never, buildTenantCtx() as never, buildRlsTx(prisma));
    await expect(
      handler.execute({ email: 'a@b.com', password: 'pass', name: 'Ali', role: 'RECEPTIONIST' as never }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('DeactivateUserHandler', () => {
  it('deactivates user', async () => {
    const prisma = buildUsersPrisma();
    const tenant = buildDeactivateTenant();
    const handler = new DeactivateUserHandler(prisma as never, tenant as never);
    await handler.execute({ userId: 'u-1' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
  });

  it('throws NotFoundException when user not found', async () => {
    const prisma = buildUsersPrisma();
    prisma.user.findUnique = jest.fn().mockResolvedValue(null);
    const tenant = buildDeactivateTenant();
    const handler = new DeactivateUserHandler(prisma as never, tenant as never);
    await expect(handler.execute({ userId: 'u-1' })).rejects.toThrow(NotFoundException);
  });

  describe('last-active-OWNER protection', () => {
    it('rejects deactivating a user when they are the only active OWNER of an org', async () => {
      const prisma = buildUsersPrisma();
      prisma.$allTenants.membership.findMany = jest.fn().mockResolvedValue([
        { id: 'm-owner', organizationId: 'org-1' },
      ]);
      prisma.$allTenants.membership.count = jest.fn().mockResolvedValue(0);
      const tenant = buildDeactivateTenant();
      const handler = new DeactivateUserHandler(prisma as never, tenant as never);
      await expect(handler.execute({ userId: 'u-1' })).rejects.toThrow(/last active OWNER|active OWNER/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('allows deactivating an OWNER when another active OWNER exists', async () => {
      const prisma = buildUsersPrisma();
      prisma.$allTenants.membership.findMany = jest.fn().mockResolvedValue([
        { id: 'm-owner', organizationId: 'org-1' },
      ]);
      prisma.$allTenants.membership.count = jest.fn().mockResolvedValue(1);
      const tenant = buildDeactivateTenant();
      const handler = new DeactivateUserHandler(prisma as never, tenant as never);
      await handler.execute({ userId: 'u-1' });
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('allows deactivating a non-OWNER user without checking', async () => {
      const prisma = buildUsersPrisma();
      prisma.$allTenants.membership.findMany = jest.fn().mockResolvedValue([]);
      const tenant = buildDeactivateTenant();
      const handler = new DeactivateUserHandler(prisma as never, tenant as never);
      await handler.execute({ userId: 'u-1' });
      expect(prisma.$allTenants.membership.count).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });
});

describe('ListUsersHandler', () => {
  it('returns paginated users', async () => {
    const prisma = buildUsersPrisma();
    const tenantCtx = { requireOrganizationId: jest.fn().mockReturnValue('org-1') };
    const handler = new ListUsersHandler(prisma as never, tenantCtx as never);
    const result = await handler.execute({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });
});

describe('GetUserHandler', () => {
  it('returns a user scoped to the current tenant membership', async () => {
    const prisma = buildUsersPrisma();
    const tenantCtx = buildTenantCtx('org-1');
    const handler = new GetUserHandler(prisma as never, tenantCtx as never);
    const result = await handler.execute({ userId: 'u-1' });
    expect(result.id).toBe('u-1');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'u-1',
          memberships: { some: { organizationId: 'org-1', isActive: true } },
        }),
        omit: { passwordHash: true },
      }),
    );
  });

  it('throws NotFoundException when user is outside the current tenant', async () => {
    const prisma = buildUsersPrisma();
    prisma.user.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new GetUserHandler(prisma as never, buildTenantCtx('org-2') as never);
    await expect(handler.execute({ userId: 'u-1' })).rejects.toThrow(NotFoundException);
  });
});

describe('UpdateUserHandler', () => {
  it('updates user fields', async () => {
    const prisma = buildUsersPrisma();
    const handler = new UpdateUserHandler(prisma as never, buildTenantCtx('org-1') as never, buildRlsTx(prisma));
    await handler.execute({
      userId: 'u-1',
      email: 'new@clinic.sa',
      name: 'New Name',
      gender: 'FEMALE' as never,
      role: 'ACCOUNTANT' as never,
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'u-1',
          memberships: { some: { organizationId: 'org-1', isActive: true } },
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          email: 'new@clinic.sa',
          name: 'New Name',
          gender: 'FEMALE',
          role: 'ACCOUNTANT',
        }),
      }),
    );
    expect(prisma.membership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-1', organizationId: 'org-1' },
        data: { role: 'ACCOUNTANT' },
      }),
    );
  });

  it('throws NotFoundException when user not found', async () => {
    const prisma = buildUsersPrisma();
    prisma.user.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new UpdateUserHandler(prisma as never, buildTenantCtx() as never, buildRlsTx(prisma));
    await expect(handler.execute({ userId: 'bad' })).rejects.toThrow('not found');
  });
});

describe('ListUsersHandler — filters', () => {
  it('applies search filter to name and email', async () => {
    const prisma = buildUsersPrisma();
    const tenantCtx = { requireOrganizationId: jest.fn().mockReturnValue('org-1') };
    const handler = new ListUsersHandler(prisma as never, tenantCtx as never);
    await handler.execute({ page: 1, limit: 10, search: 'ahmad' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.arrayContaining([expect.objectContaining({ name: expect.anything() })]) }),
      }),
    );
  });

  it('returns paginated meta', async () => {
    const prisma = buildUsersPrisma();
    const tenantCtx = { requireOrganizationId: jest.fn().mockReturnValue('org-1') };
    const handler = new ListUsersHandler(prisma as never, tenantCtx as never);
    const result = await handler.execute({ page: 1, limit: 10 });
    expect(result.meta).toMatchObject({ total: 1, page: 1, perPage: 10, totalPages: 1 });
  });
});

describe('ListUsersHandler — tenant scoping (P0)', () => {
  it('filters users by current tenant via Membership relation', async () => {
    const prisma = buildUsersPrisma();
    const tenantCtx = { requireOrganizationId: jest.fn().mockReturnValue('org-A') };
    const handler = new ListUsersHandler(prisma as never, tenantCtx as never);
    await handler.execute({ page: 1, limit: 10 });
    expect(tenantCtx.requireOrganizationId).toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberships: { some: { organizationId: 'org-A', isActive: true } },
        }),
      }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberships: { some: { organizationId: 'org-A', isActive: true } },
        }),
      }),
    );
  });

  it('throws when no tenant context (strict mode)', async () => {
    const prisma = buildUsersPrisma();
    const tenantCtx = {
      requireOrganizationId: jest.fn().mockImplementation(() => {
        throw new Error('UnauthorizedTenantAccess');
      }),
    };
    const handler = new ListUsersHandler(prisma as never, tenantCtx as never);
    await expect(handler.execute({ page: 1, limit: 10 })).rejects.toThrow('UnauthorizedTenantAccess');
  });
});
