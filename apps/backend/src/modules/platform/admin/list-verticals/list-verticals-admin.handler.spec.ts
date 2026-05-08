import { ListVerticalsAdminHandler } from './list-verticals-admin.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('ListVerticalsAdminHandler', () => {
  function buildHandler(findManyResult: unknown[], countResult: number) {
    const findMany = jest.fn().mockResolvedValue(findManyResult);
    const count = jest.fn().mockResolvedValue(countResult);
    const prismaMock = {
      $allTenants: { vertical: { findMany, count } },
    } as unknown as PrismaService;

    const handler = new ListVerticalsAdminHandler(prismaMock);
    return { handler, findMany, count };
  }

  it('defaults to page=1, perPage=20', async () => {
    const { handler, findMany, count } = buildHandler([{ id: 'v1' }], 1);
    const result = await handler.execute();

    expect(findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 20,
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
    expect(count).toHaveBeenCalled();
    expect(result.meta).toEqual({ page: 1, perPage: 20, total: 1, totalPages: 1 });
    expect(result.items).toHaveLength(1);
  });

  it('applies custom page and perPage', async () => {
    const { handler, findMany } = buildHandler([], 45);
    const result = await handler.execute({ page: 3, perPage: 10 });

    expect(findMany).toHaveBeenCalledWith({
      skip: 20,
      take: 10,
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }],
    });
    expect(result.meta).toEqual({ page: 3, perPage: 10, total: 45, totalPages: 5 });
  });

  it('caps perPage at 100', async () => {
    const { handler, findMany } = buildHandler([], 200);
    const result = await handler.execute({ perPage: 999 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(result.meta.perPage).toBe(100);
  });

  it('floors page to 1 for invalid input', async () => {
    const { handler, findMany } = buildHandler([], 5);
    const result = await handler.execute({ page: -3 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
    expect(result.meta.page).toBe(1);
  });

  it('returns totalPages=1 when total=0', async () => {
    const { handler } = buildHandler([], 0);
    const result = await handler.execute();
    expect(result.meta.totalPages).toBe(1);
  });

  it('tracks total across pages correctly (40 items, 3 pages of 15)', async () => {
    const { handler } = buildHandler(Array(15).fill({ id: 'x' }), 40);
    const result = await handler.execute({ page: 1, perPage: 15 });
    expect(result.meta).toEqual({ page: 1, perPage: 15, total: 40, totalPages: 3 });
  });
});
