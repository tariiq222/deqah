import { PublicTenantsController } from './tenants.controller';

describe('PublicTenantsController', () => {
  describe('existsEndpoint', () => {
    it('forwards x-forwarded-host header to CheckTenantExistsHandler', async () => {
      const checkTenantExists = {
        execute: jest.fn().mockResolvedValue({ exists: true, organizationId: 'org-1' }),
      };
      const controller = new PublicTenantsController(
        {} as never,
        checkTenantExists as never,
        {} as never,
        {} as never,
      );

      const result = await controller.existsEndpoint(
        'sawa.deqah.net',
        'fallback.deqah.net',
        undefined,
      );

      expect(checkTenantExists.execute).toHaveBeenCalledWith('sawa.deqah.net');
      expect(result).toEqual({ exists: true, organizationId: 'org-1' });
    });

    it('falls back to host header when x-forwarded-host is undefined', async () => {
      const checkTenantExists = {
        execute: jest.fn().mockResolvedValue({ exists: false }),
      };
      const controller = new PublicTenantsController(
        {} as never,
        checkTenantExists as never,
        {} as never,
        {} as never,
      );

      const result = await controller.existsEndpoint(undefined, 'sawa.deqah.net', undefined);

      expect(checkTenantExists.execute).toHaveBeenCalledWith('sawa.deqah.net');
      expect(result).toEqual({ exists: false });
    });

    it('prefers x-deqah-tenant-host over proxy-owned forwarded host', async () => {
      const checkTenantExists = {
        execute: jest.fn().mockResolvedValue({ exists: true, organizationId: 'org-1' }),
      };
      const controller = new PublicTenantsController(
        {} as never,
        checkTenantExists as never,
        {} as never,
        {} as never,
      );

      const result = await controller.existsEndpoint(
        'api.deqah.net',
        'api.deqah.net',
        'sawa.deqah.net',
      );

      expect(checkTenantExists.execute).toHaveBeenCalledWith('sawa.deqah.net');
      expect(result).toEqual({ exists: true, organizationId: 'org-1' });
    });
  });
});
