import { RlsHelper } from './rls.helper';
import { TenantContextService } from './tenant-context.service';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { Prisma } from '@prisma/client';

describe('RlsHelper', () => {
  it('no-ops when tenant context is unset', async () => {
    const ctx = { getOrganizationId: () => undefined } as unknown as TenantContextService;
    const helper = new RlsHelper({} as PrismaService, ctx);
    const tx = { $queryRaw: jest.fn() } as unknown as Prisma.TransactionClient;
    await helper.applyInTransaction(tx);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('sets app.current_org_id via parameterized set_config', async () => {
    const orgId = '11111111-1111-1111-1111-111111111111';
    const ctx = { getOrganizationId: () => orgId } as unknown as TenantContextService;
    const helper = new RlsHelper({} as PrismaService, ctx);
    const tx = { $queryRaw: jest.fn().mockResolvedValue(undefined) } as unknown as Prisma.TransactionClient;
    await helper.applyInTransaction(tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects non-UUID orgId before calling set_config', async () => {
    const ctx = { getOrganizationId: () => "o'rg-invalid" } as unknown as TenantContextService;
    const helper = new RlsHelper({} as PrismaService, ctx);
    const tx = { $queryRaw: jest.fn() } as unknown as Prisma.TransactionClient;
    await expect(helper.applyInTransaction(tx)).rejects.toThrow(
      'RlsHelper: invalid orgId shape rejected before set_config',
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('runWithoutTenant wraps callback in a transaction with bypass_rls set', async () => {
    const ctx = { getOrganizationId: () => undefined } as unknown as TenantContextService;
    const txClient = { $queryRaw: jest.fn().mockResolvedValue(undefined) } as unknown as Prisma.TransactionClient;
    const bypassClient = {
      $transaction: jest.fn().mockImplementation(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => fn(txClient)),
    };
    const prisma = {
      __bypassClient: bypassClient,
    } as unknown as PrismaService;
    const helper = new RlsHelper(prisma, ctx);
    const result = await helper.runWithoutTenant(async () => 'data');
    expect(bypassClient.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toBe('data');
  });
});
