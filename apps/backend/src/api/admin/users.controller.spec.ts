import { AdminUsersController } from './users.controller';
import { Request } from 'express';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const searchHandler = fn();
  const resetHandler = fn();
  const controller = new AdminUsersController(
    searchHandler as never,
    resetHandler as never,
  );
  return { controller, searchHandler, resetHandler };
}

describe('AdminUsersController', () => {
  const user = { sub: 'admin-1' };
  const req = { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as unknown as Request;

  it('search — handles defaults and parsing', async () => {
    const { controller, searchHandler } = buildController();
    
    // Default case
    await controller.search();
    expect(searchHandler.execute).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      search: undefined,
      organizationId: undefined,
    });

    // Custom values
    await controller.search('2', '50', ' john ', ' org-1 ');
    expect(searchHandler.execute).toHaveBeenCalledWith({
      page: 2,
      perPage: 50,
      search: 'john',
      organizationId: 'org-1',
    });

    // Clamping and whitespace
    await controller.search('0', '200', ' ', ' ');
    expect(searchHandler.execute).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      perPage: 100,
      search: undefined,
      organizationId: undefined,
    }));
  });

  it('resetPassword — passes context', async () => {
    const { controller, resetHandler } = buildController();
    await controller.resetPassword('user-1', {}, user, req);
    expect(resetHandler.execute).toHaveBeenCalledWith({
      targetUserId: 'user-1',
      superAdminUserId: user.sub,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });
});
