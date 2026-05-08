import { AdminPlansController } from './plans.controller';
import { Request } from 'express';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const listHandler = fn();
  const createHandler = fn();
  const updateHandler = fn();
  const deleteHandler = fn();
  const controller = new AdminPlansController(
    listHandler as never,
    createHandler as never,
    updateHandler as never,
    deleteHandler as never,
  );
  return { controller, listHandler, createHandler, updateHandler, deleteHandler };
}

describe('AdminPlansController', () => {
  const user = { id: 'admin-1' };
  const req = { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as unknown as Request;

  it('list — calls handler with no args when no query params', async () => {
    const { controller, listHandler } = buildController();
    await controller.list();
    expect(listHandler.execute).toHaveBeenCalledWith({ page: undefined, perPage: undefined });
  });

  it('list — passes parsed page and perPage to handler', async () => {
    const { controller, listHandler } = buildController();
    await controller.list('2', '50');
    expect(listHandler.execute).toHaveBeenCalledWith({ page: 2, perPage: 50 });
  });

  it('create — strips reason from data and passes context', async () => {
    const { controller, createHandler } = buildController();
    const dto = { name: 'Gold', reason: 'new tier', price: 100 } as never;
    await controller.create(dto, user, req);
    expect(createHandler.execute).toHaveBeenCalledWith({
      superAdminUserId: user.id,
      reason: 'new tier',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
      data: { name: 'Gold', price: 100 },
    });
  });

  it('update — strips reason from data and passes context', async () => {
    const { controller, updateHandler } = buildController();
    const dto = { name: 'Gold+', reason: 'price increase', price: 110 } as never;
    await controller.update('plan-1', dto, user, req);
    expect(updateHandler.execute).toHaveBeenCalledWith({
      planId: 'plan-1',
      superAdminUserId: user.id,
      reason: 'price increase',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
      data: { name: 'Gold+', price: 110 },
    });
  });

  it('remove — passes context and reason', async () => {
    const { controller, deleteHandler } = buildController();
    await controller.remove('plan-1', { reason: 'retired' }, user, req);
    expect(deleteHandler.execute).toHaveBeenCalledWith({
      planId: 'plan-1',
      superAdminUserId: user.id,
      reason: 'retired',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });
});
