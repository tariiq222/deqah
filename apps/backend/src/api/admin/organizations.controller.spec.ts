import { AdminOrganizationsController } from './organizations.controller';
import { Request } from 'express';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const listHandler = fn();
  const getHandler = fn();
  const createTenantHandler = fn();
  const updateOrganizationHandler = fn();
  const archiveOrganizationHandler = fn();
  const suspendHandler = fn();
  const reinstateHandler = fn();
  const controller = new AdminOrganizationsController(
    listHandler as never,
    getHandler as never,
    createTenantHandler as never,
    updateOrganizationHandler as never,
    archiveOrganizationHandler as never,
    suspendHandler as never,
    reinstateHandler as never,
  );
  return {
    controller,
    listHandler,
    getHandler,
    createTenantHandler,
    updateOrganizationHandler,
    archiveOrganizationHandler,
    suspendHandler,
    reinstateHandler,
  };
}

describe('AdminOrganizationsController', () => {
  const user = { sub: 'admin-1' };
  const req = { ip: '1.1.1.1', headers: { 'user-agent': 'jest' } } as unknown as Request;

  it('list — handles defaults and parsing', async () => {
    const { controller, listHandler } = buildController();
    
    // Default case
    await controller.list();
    expect(listHandler.execute).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      search: undefined,
      suspended: undefined,
      status: undefined,
      verticalId: undefined,
      planId: undefined,
    });

    // Custom values
    await controller.list('2', '50', ' ACME ', 'true', 'trialing', ' vertical-1 ', ' plan-1 ');
    expect(listHandler.execute).toHaveBeenCalledWith({
      page: 2,
      perPage: 50,
      search: 'ACME',
      suspended: true,
      status: 'TRIALING',
      verticalId: 'vertical-1',
      planId: 'plan-1',
    });

    // Clamping and false boolean
    await controller.list('0', '200', ' ', 'false', 'invalid', ' ', ' ');
    expect(listHandler.execute).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      perPage: 100,
      search: undefined,
      suspended: false,
      status: undefined,
      verticalId: undefined,
      planId: undefined,
    }));
  });

  it('show — passes id', async () => {
    const { controller, getHandler } = buildController();
    await controller.show('org-1');
    expect(getHandler.execute).toHaveBeenCalledWith({ id: 'org-1' });
  });

  it('create — passes body and request context', async () => {
    const { controller, createTenantHandler } = buildController();
    const body = {
      slug: 'riyadh-clinic',
      nameAr: 'عيادة الرياض',
      ownerUserId: 'owner-1',
      reason: 'Create tenant for onboarding',
    };

    await controller.create(body, user, req);

    expect(createTenantHandler.execute).toHaveBeenCalledWith({
      ...body,
      superAdminUserId: user.sub,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('update — passes id, body, and request context', async () => {
    const { controller, updateOrganizationHandler } = buildController();
    const body = {
      nameAr: 'اسم محدث',
      nameEn: null,
      verticalSlug: null,
      reason: 'Update tenant metadata',
    };

    await controller.update('org-1', body, user, req);

    expect(updateOrganizationHandler.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      ...body,
      superAdminUserId: user.sub,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('archive — passes id and request context', async () => {
    const { controller, archiveOrganizationHandler } = buildController();

    await controller.archive('org-1', {}, user, req);

    expect(archiveOrganizationHandler.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      superAdminUserId: user.sub,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('suspend — passes context', async () => {
    const { controller, suspendHandler } = buildController();
    await controller.suspend('org-1', {}, user, req);
    expect(suspendHandler.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      superAdminUserId: user.sub,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });

  it('reinstate — passes context', async () => {
    const { controller, reinstateHandler } = buildController();
    await controller.reinstate('org-1', {}, user, req);
    expect(reinstateHandler.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      superAdminUserId: user.sub,
      ipAddress: '1.1.1.1',
      userAgent: 'jest',
    });
  });
});
