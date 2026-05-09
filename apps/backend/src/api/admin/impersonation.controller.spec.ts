import { AdminImpersonationController } from './impersonation.controller';
import { Request } from 'express';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const startHandler = fn();
  const endHandler = fn();
  const listHandler = fn();
  const controller = new AdminImpersonationController(
    startHandler as never,
    endHandler as never,
    listHandler as never,
  );
  return { controller, startHandler, endHandler, listHandler };
}

describe('AdminImpersonationController', () => {
  const user = { sub: 'admin-1' };
  const req = { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as unknown as Request;

  it('start — passes context correctly', async () => {
    const { controller, startHandler } = buildController();
    const dto = { organizationId: 'org-1', targetUserId: 'user-1' };
    await controller.start(dto, user, req);
    expect(startHandler.execute).toHaveBeenCalledWith({
      superAdminUserId: user.sub,
      organizationId: dto.organizationId,
      targetUserId: dto.targetUserId,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('end — calls handler with manual reason', async () => {
    const { controller, endHandler } = buildController();
    await controller.end('sess-1', user, req);
    expect(endHandler.execute).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      superAdminUserId: user.sub,
      endedReason: 'manual',
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('list — handles pagination and boolean parsing', async () => {
    const { controller, listHandler } = buildController();
    
    // Default case
    await controller.list();
    expect(listHandler.execute).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      active: undefined,
      superAdminUserId: undefined,
      organizationId: undefined,
    });

    // Parsed values
    await controller.list('2', '100', 'true', ' admin-1 ', ' org-1 ');
    expect(listHandler.execute).toHaveBeenCalledWith({
      page: 2,
      perPage: 100,
      active: true,
      superAdminUserId: 'admin-1',
      organizationId: 'org-1',
    });

    // Clamping and false boolean
    await controller.list('0', '500', 'false');
    expect(listHandler.execute).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      perPage: 200,
      active: false,
    }));
  });
});
