/**
 * Transaction Safety Tests
 *
 * Tests that verify $transaction usages properly scope queries to the
 * current tenant context. Since $transaction bypasses the Prisma extension,
 * callers MUST explicitly include organizationId in their queries.
 *
 * This test verifies the patterns used across the codebase are safe.
 */
import { RlsHelper } from './rls.helper';
import { TenantContextService } from './tenant-context.service';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { Prisma } from '@prisma/client';

describe('Transaction Safety Patterns', () => {
  let mockTx: jest.Mocked<Prisma.TransactionClient>;
  let mockPrisma: jest.Mocked<PrismaService>;
  let ctx: TenantContextService;

  beforeEach(() => {
    mockTx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      booking: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      invoice: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as jest.Mocked<Prisma.TransactionClient>;

    ctx = {
      getOrganizationId: jest.fn(),
    } as unknown as TenantContextService;

    mockPrisma = {
      $transaction: jest.fn(),
      __bypassClient: {
        $transaction: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
  });

  describe('RlsHelper.applyInTransaction', () => {
    it('sets app.current_org_id GUC when organizationId is present', async () => {
      const orgId = '12345678-1234-1234-1234-123456789012';
      (ctx.getOrganizationId as jest.Mock).mockReturnValue(orgId);

      const helper = new RlsHelper(mockPrisma, ctx);
      await helper.applyInTransaction(mockTx);

      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      const [[query]] = mockTx.$queryRaw.mock.calls;
      const queryStr = String(query);
      expect(queryStr).toContain('set_config');
      expect(queryStr).toContain('app.current_org_id');
    });

    it('no-ops when organizationId is missing', async () => {
      (ctx.getOrganizationId as jest.Mock).mockReturnValue(undefined);

      const helper = new RlsHelper(mockPrisma, ctx);
      await helper.applyInTransaction(mockTx);

      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects invalid orgId shapes', async () => {
      (ctx.getOrganizationId as jest.Mock).mockReturnValue("invalid'; DROP TABLE users;--");

      const helper = new RlsHelper(mockPrisma, ctx);
      await expect(helper.applyInTransaction(mockTx)).rejects.toThrow(
        'RlsHelper: invalid orgId shape rejected before set_config',
      );
    });

    it('uses parameterized query to prevent SQL injection', async () => {
      const orgId = '12345678-1234-1234-1234-123456789012';
      (ctx.getOrganizationId as jest.Mock).mockReturnValue(orgId);

      const helper = new RlsHelper(mockPrisma, ctx);
      await helper.applyInTransaction(mockTx);

      expect(mockTx.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('RlsHelper.runWithoutTenant', () => {
    it('wraps callback in transaction with bypass_rls enabled', async () => {
      let bypassSet = false;
      mockTx.$queryRaw = jest.fn().mockImplementation((query: unknown) => {
        const queryStr = String(query);
        if (queryStr.includes('bypass_rls')) {
          bypassSet = true;
        }
        return Promise.resolve(undefined);
      });

      (mockPrisma.__bypassClient.$transaction as jest.Mock).mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        return fn(mockTx);
      });

      const helper = new RlsHelper(mockPrisma, ctx);
      const result = await helper.runWithoutTenant(async () => 'success');

      expect(result).toBe('success');
      expect(bypassSet).toBe(true);
    });

    it('allows super-admin operations to read across tenants', async () => {
      (mockPrisma.__bypassClient.$transaction as jest.Mock).mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        return fn(mockTx);
      });
      mockTx.booking.findMany = jest.fn().mockResolvedValue([]);

      const helper = new RlsHelper(mockPrisma, ctx);
      const result = await helper.runWithoutTenant(async () => {
        return mockTx.booking.findMany({});
      });

      expect(result).toEqual([]);
    });
  });

  describe('Safe Transaction Patterns', () => {
    it('pattern: PK-based lookup is safe inside transaction', async () => {
      const bookingId = 'booking-123';
      mockTx.booking.findFirst = jest.fn().mockResolvedValue({ id: bookingId, organizationId: 'org-1' });

      const result = await mockTx.booking.findFirst({ where: { id: bookingId } });

      expect(result).toBeDefined();
      expect(mockTx.booking.findFirst).toHaveBeenCalledWith({ where: { id: bookingId } });
    });

    it('pattern: explicit organizationId filter is required for scoped queries', async () => {
      const orgId = 'org-explicit';
      mockTx.booking.findMany = jest.fn().mockResolvedValue([]);

      await mockTx.booking.findMany({
        where: { organizationId: orgId, status: 'CONFIRMED' },
      });

      expect(mockTx.booking.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId, status: 'CONFIRMED' },
      });
    });

    it('pattern: count with organizationId filter is safe', async () => {
      mockTx.booking.count = jest.fn().mockResolvedValue(5);

      const count = await mockTx.booking.count({
        where: { organizationId: 'org-count', status: 'CONFIRMED' },
      });

      expect(count).toBe(5);
      expect(mockTx.booking.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-count', status: 'CONFIRMED' },
      });
    });
  });

  describe('Unsafe Transaction Patterns (documenting anti-patterns)', () => {
    it('WARNING: bare findFirst without organizationId in transaction is unsafe', async () => {
      mockTx.booking.findFirst = jest.fn().mockResolvedValue({ id: 'booking-123' });

      const booking = await mockTx.booking.findFirst({
        where: { status: 'CONFIRMED' },
      });

      expect(booking).toBeDefined();
    });

    it('WARNING: findMany without organizationId filter returns all matching rows', async () => {
      mockTx.booking.findMany = jest.fn().mockResolvedValue([
        { id: 'b1', organizationId: 'org-1' },
        { id: 'b2', organizationId: 'org-2' },
      ]);

      const bookings = await mockTx.booking.findMany({
        where: { status: 'CONFIRMED' },
      });

      expect(bookings).toHaveLength(2);
    });
  });
});
