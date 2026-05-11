import { DashboardZohoController } from './zoho.controller';
import { CHECK_PERMISSIONS_KEY, RequiredPermission } from '../../common/guards/casl.guard';

// ── CASL permission decorator coverage (TAR-47) ────────────────────────────
// Every dashboard /integrations/zoho route except the public OAuth callback
// must carry an explicit @CheckPermissions decorator. Missing decorators
// previously fail-opened (parent: TAR-41 / TAR-47).
describe('@CheckPermissions decorator coverage (TAR-47)', () => {
  const PROTOTYPE = DashboardZohoController.prototype as unknown as Record<string, unknown>;
  const expected: Array<{ method: string; permission: RequiredPermission }> = [
    { method: 'status', permission: { action: 'read', subject: 'Setting' } },
    { method: 'connect', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'selectOrg', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'removeConnection', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'update', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'test', permission: { action: 'manage', subject: 'Setting' } },
    { method: 'list', permission: { action: 'read', subject: 'Invoice' } },
    { method: 'get', permission: { action: 'read', subject: 'Invoice' } },
    { method: 'send', permission: { action: 'update', subject: 'Invoice' } },
    { method: 'void', permission: { action: 'update', subject: 'Invoice' } },
    { method: 'paymentMirrors', permission: { action: 'read', subject: 'Payment' } },
  ];

  it.each(expected)(
    '$method declares CheckPermissions($permission.action, $permission.subject)',
    ({ method, permission }) => {
      const meta = Reflect.getMetadata(
        CHECK_PERMISSIONS_KEY,
        PROTOTYPE[method] as object,
      ) as RequiredPermission[] | undefined;
      expect(meta).toBeDefined();
      expect(meta).toEqual(expect.arrayContaining([expect.objectContaining(permission)]));
    },
  );

  it('callback (OAuth redirect) is intentionally @Public — no @CheckPermissions required', () => {
    const meta = Reflect.getMetadata(
      CHECK_PERMISSIONS_KEY,
      PROTOTYPE['callback'] as object,
    );
    expect(meta).toBeUndefined();
  });
});
