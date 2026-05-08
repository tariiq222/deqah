import { AdminVerticalsController } from './verticals.controller';
import { Request } from 'express';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const listHandler = fn();
  const createHandler = fn();
  const updateHandler = fn();
  const deleteHandler = fn();
  const controller = new AdminVerticalsController(
    listHandler as never,
    createHandler as never,
    updateHandler as never,
    deleteHandler as never,
  );
  return { controller, listHandler, createHandler, updateHandler, deleteHandler };
}

describe('AdminVerticalsController', () => {
  const user = { id: 'admin-1' };
  const req = { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as unknown as Request;

  it('list — calls handler with no query params (defaults)', async () => {
    const { controller, listHandler } = buildController();
    await controller.list(undefined, undefined);
    expect(listHandler.execute).toHaveBeenCalledWith({ page: undefined, perPage: undefined });
  });

  it('list — passes parsed page and perPage to handler', async () => {
    const { controller, listHandler } = buildController();
    await controller.list('2', '10');
    expect(listHandler.execute).toHaveBeenCalledWith({ page: 2, perPage: 10 });
  });

  it('create — strips reason from data and passes context', async () => {
    const { controller, createHandler } = buildController();
    const dto = { name: 'Healthcare', reason: 'new sector' } as never;
    await controller.create(dto, user, req);
    expect(createHandler.execute).toHaveBeenCalledWith({
      superAdminUserId: user.id,
      reason: 'new sector',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
      data: { name: 'Healthcare' },
    });
  });

  it('update — strips reason from data and passes context', async () => {
    const { controller, updateHandler } = buildController();
    const dto = { name: 'Health & Wellness', reason: 'renaming' } as never;
    await controller.update('vert-1', dto, user, req);
    expect(updateHandler.execute).toHaveBeenCalledWith({
      verticalId: 'vert-1',
      superAdminUserId: user.id,
      reason: 'renaming',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
      data: { name: 'Health & Wellness' },
    });
  });

  it('remove — passes context and reason', async () => {
    const { controller, deleteHandler } = buildController();
    await controller.remove('vert-1', { reason: 'obsolete' }, user, req);
    expect(deleteHandler.execute).toHaveBeenCalledWith({
      verticalId: 'vert-1',
      superAdminUserId: user.id,
      reason: 'obsolete',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });
});
