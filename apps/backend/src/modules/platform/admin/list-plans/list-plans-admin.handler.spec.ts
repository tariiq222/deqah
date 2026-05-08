import { Test } from '@nestjs/testing';
import { ListPlansAdminHandler } from './list-plans-admin.handler';
import { PrismaService } from '../../../../infrastructure/database';

function buildMock(items: object[], total: number) {
  const findMany = jest.fn().mockResolvedValue(items);
  const count = jest.fn().mockResolvedValue(total);
  const prismaMock = { $allTenants: { plan: { findMany, count } } } as unknown as PrismaService;
  return { findMany, count, prismaMock };
}

async function buildHandler(prismaMock: PrismaService) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ListPlansAdminHandler,
      { provide: PrismaService, useValue: prismaMock },
    ],
  }).compile();
  return moduleRef.get(ListPlansAdminHandler);
}

describe('ListPlansAdminHandler', () => {
  it('lists plans across all tenants ordered by isActive then sortOrder', async () => {
    const { findMany, prismaMock } = buildMock([{ id: 'p1' }, { id: 'p2' }], 2);
    const handler = await buildHandler(prismaMock);

    const result = await handler.execute();

    expect(result.items).toHaveLength(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
        include: { _count: { select: { subscriptions: true } } },
      }),
    );
  });

  it('defaults to page=1 and perPage=20 when called with no args', async () => {
    const { findMany, count, prismaMock } = buildMock([], 0);
    const handler = await buildHandler(prismaMock);

    const result = await handler.execute();

    expect(result.meta.page).toBe(1);
    expect(result.meta.perPage).toBe(20);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(count).toHaveBeenCalled();
  });

  it('honors custom page and perPage', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
    const { findMany, prismaMock } = buildMock(items, 50);
    const handler = await buildHandler(prismaMock);

    const result = await handler.execute({ page: 3, perPage: 5 });

    expect(result.meta.page).toBe(3);
    expect(result.meta.perPage).toBe(5);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });

  it('caps perPage at 100 when perPage exceeds 100', async () => {
    const { findMany, prismaMock } = buildMock([], 0);
    const handler = await buildHandler(prismaMock);

    const result = await handler.execute({ perPage: 500 });

    expect(result.meta.perPage).toBe(100);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('floors page at 1 when page < 1', async () => {
    const { findMany, prismaMock } = buildMock([], 0);
    const handler = await buildHandler(prismaMock);

    const result = await handler.execute({ page: -5 });

    expect(result.meta.page).toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });

  it('meta.total reflects DB count, not items.length', async () => {
    const { prismaMock } = buildMock([{ id: 'p1' }, { id: 'p2' }], 50);
    const handler = await buildHandler(prismaMock);

    const result = await handler.execute({ page: 1, perPage: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.meta.total).toBe(50);
    expect(result.meta.totalPages).toBe(25);
  });

  it('meta.totalPages is 1 when count is 0', async () => {
    const { prismaMock } = buildMock([], 0);
    const handler = await buildHandler(prismaMock);

    const result = await handler.execute();

    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(1);
  });
});
