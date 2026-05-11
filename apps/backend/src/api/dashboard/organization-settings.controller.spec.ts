import { DashboardOrganizationSettingsController } from './organization-settings.controller';
import { REQUIRE_FEATURE_KEY } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { CHECK_PERMISSIONS_KEY, type RequiredPermission } from '../../common/guards/casl.guard';
import { CaslAbilityFactory } from '../../modules/identity/casl/casl-ability.factory';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const createService = fn({ id: 'svc-1' });
  const updateService = fn({ id: 'svc-1' });
  const listServices = fn({ data: [] });
  const getService = fn({ id: 'svc-1' });
  const archiveService = fn({ id: 'svc-1' });
  const upsertBranding = fn({ id: 'br-1' });
  const getBranding = fn({ id: 'br-1' });
  const createIntakeForm = fn({ id: 'if-1' });
  const getIntakeForm = fn({ id: 'if-1' });
  const listIntakeForms = fn({ data: [] });
  const deleteIntakeForm = fn(undefined);
  const submitRating = fn({ id: 'r-1' });
  const listRatings = fn({ data: [] });
  const getOrgSettings = fn({ id: 'os-1' });
  const upsertOrgSettings = fn({ id: 'os-1' });
  const getBookingSettings = fn({ id: 'bs-1' });
  const upsertBookingSettings = fn({ id: 'bs-1' });
  const setServiceBookingConfigs = fn({ id: 'sbc-1' });
  const getServiceBookingConfigs = fn({ id: 'sbc-1' });
  const listServiceEmployees = fn([]);
  const uploadLogo = fn({ fileId: 'f-1', url: 'https://example.com/logo.png' });
  const prisma = {
    organization: { update: jest.fn().mockResolvedValue({}) },
    vertical: { findFirst: jest.fn().mockResolvedValue({ id: 'vert-1' }) },
  };
  const tenant = { requireOrganizationId: jest.fn().mockReturnValue('org-1') };
  const seedFromVertical = fn({ skipped: false });
  const controller = new DashboardOrganizationSettingsController(
    createService as never, updateService as never, listServices as never, getService as never, archiveService as never,
    upsertBranding as never, getBranding as never, uploadLogo as never,
    createIntakeForm as never, getIntakeForm as never, listIntakeForms as never,
    deleteIntakeForm as never, submitRating as never, listRatings as never,
    getOrgSettings as never, upsertOrgSettings as never,
    getBookingSettings as never, upsertBookingSettings as never,
    setServiceBookingConfigs as never, getServiceBookingConfigs as never,
    listServiceEmployees as never,
    prisma as never,
    tenant as never,
    seedFromVertical as never,
  );
  return { controller, createService, updateService, listServices, getService, archiveService, upsertBranding, getBranding, uploadLogo, createIntakeForm, getIntakeForm, listIntakeForms, deleteIntakeForm, submitRating, listRatings, getOrgSettings, upsertOrgSettings, getBookingSettings, upsertBookingSettings, setServiceBookingConfigs, getServiceBookingConfigs, prisma, tenant };
}

describe('DashboardOrganizationSettingsController', () => {
  it('createServiceEndpoint — passes body', async () => {
    const { controller, createService } = buildController();
    await controller.createServiceEndpoint({ nameAr: 'خدمة' } as never);
    expect(createService.execute).toHaveBeenCalled();
  });

  it('listServicesEndpoint — passes query', async () => {
    const { controller, listServices } = buildController();
    await controller.listServicesEndpoint({} as never);
    expect(listServices.execute).toHaveBeenCalled();
  });

  it('updateServiceEndpoint — passes id', async () => {
    const { controller, updateService } = buildController();
    await controller.updateServiceEndpoint('svc-1', {} as never);
    expect(updateService.execute).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'svc-1' }),
    );
  });

  it('archiveServiceEndpoint — passes id', async () => {
    const { controller, archiveService } = buildController();
    await controller.archiveServiceEndpoint('svc-1');
    expect(archiveService.execute).toHaveBeenCalledWith({ serviceId: 'svc-1' });
  });

  it('upsertBrandingEndpoint — passes body', async () => {
    const { controller, upsertBranding } = buildController();
    await controller.upsertBrandingEndpoint({ logoUrl: 'https://example.com/logo.png' } as never);
    expect(upsertBranding.execute).toHaveBeenCalledWith(expect.objectContaining({ logoUrl: 'https://example.com/logo.png' }));
  });

  it('getBrandingEndpoint — calls with no args', async () => {
    const { controller, getBranding } = buildController();
    await controller.getBrandingEndpoint();
    expect(getBranding.execute).toHaveBeenCalledWith();
  });

  it('createIntakeFormEndpoint — passes body', async () => {
    const { controller, createIntakeForm } = buildController();
    await controller.createIntakeFormEndpoint({ title: 'Form' } as never);
    expect(createIntakeForm.execute).toHaveBeenCalled();
  });

  it('listIntakeFormsEndpoint — passes query', async () => {
    const { controller, listIntakeForms } = buildController();
    await controller.listIntakeFormsEndpoint({} as never);
    expect(listIntakeForms.execute).toHaveBeenCalled();
  });

  it('submitRatingEndpoint — passes body', async () => {
    const { controller, submitRating } = buildController();
    await controller.submitRatingEndpoint({ bookingId: 'b-1', score: 5 } as never);
    expect(submitRating.execute).toHaveBeenCalled();
  });

  it('listRatingsEndpoint — passes query', async () => {
    const { controller, listRatings } = buildController();
    await controller.listRatingsEndpoint({} as never);
    expect(listRatings.execute).toHaveBeenCalled();
  });

  it('getOrgSettingsEndpoint — calls with no args', async () => {
    const { controller, getOrgSettings } = buildController();
    await controller.getOrgSettingsEndpoint();
    expect(getOrgSettings.execute).toHaveBeenCalledWith();
  });

  it('upsertOrgSettingsEndpoint — passes body', async () => {
    const { controller, upsertOrgSettings } = buildController();
    await controller.upsertOrgSettingsEndpoint({ companyNameAr: 'Company' } as never);
    expect(upsertOrgSettings.execute).toHaveBeenCalledWith(expect.objectContaining({ companyNameAr: 'Company' }));
  });
});

describe('@RequireFeature metadata — INTAKE_FORMS', () => {
  it.each([
    'createIntakeFormEndpoint',
    'listIntakeFormsEndpoint',
    'getIntakeFormEndpoint',
    'deleteIntakeFormEndpoint',
  ])('annotates %s with FeatureKey.INTAKE_FORMS', (method) => {
    const meta = Reflect.getMetadata(
      REQUIRE_FEATURE_KEY,
      (DashboardOrganizationSettingsController.prototype as unknown as Record<string, unknown>)[method] as object,
    );
    expect(meta).toBe(FeatureKey.INTAKE_FORMS);
  });
});

describe('@RequireFeature metadata — CLIENT_RATINGS', () => {
  it.each([
    'submitRatingEndpoint',
    'listRatingsEndpoint',
  ])('annotates %s with FeatureKey.CLIENT_RATINGS', (method) => {
    const meta = Reflect.getMetadata(
      REQUIRE_FEATURE_KEY,
      (DashboardOrganizationSettingsController.prototype as unknown as Record<string, unknown>)[method] as object,
    );
    expect(meta).toBe(FeatureKey.CLIENT_RATINGS);
  });
});

// ── CASL permission decorator coverage (TAR-46) ────────────────────────────
// Every dashboard /organization settings route must carry an explicit
// @CheckPermissions decorator. Missing decorators previously fail-opened
// (parent: TAR-41 / TAR-45).
describe('@CheckPermissions decorator coverage (TAR-46)', () => {
  const PROTOTYPE = DashboardOrganizationSettingsController.prototype as unknown as Record<string, unknown>;
  const expected: Array<{ method: string; permission: RequiredPermission }> = [
    // services
    { method: 'createServiceEndpoint',             permission: { action: 'create', subject: 'Service' } },
    { method: 'listServicesEndpoint',              permission: { action: 'read',   subject: 'Service' } },
    { method: 'getServiceEndpoint',                permission: { action: 'read',   subject: 'Service' } },
    { method: 'updateServiceEndpoint',             permission: { action: 'update', subject: 'Service' } },
    { method: 'archiveServiceEndpoint',            permission: { action: 'delete', subject: 'Service' } },
    { method: 'listServiceEmployeesEndpoint',      permission: { action: 'read',   subject: 'Service' } },
    { method: 'getServiceBookingTypesEndpoint',    permission: { action: 'read',   subject: 'Service' } },
    { method: 'setServiceBookingTypesEndpoint',    permission: { action: 'update', subject: 'Service' } },
    // branding
    { method: 'upsertBrandingEndpoint',            permission: { action: 'update', subject: 'Branding' } },
    { method: 'getBrandingEndpoint',               permission: { action: 'read',   subject: 'Branding' } },
    { method: 'uploadLogoEndpoint',                permission: { action: 'update', subject: 'Branding' } },
    // intake forms — gated as Setting since no dedicated subject exists
    { method: 'createIntakeFormEndpoint',          permission: { action: 'manage', subject: 'Setting' } },
    { method: 'listIntakeFormsEndpoint',           permission: { action: 'read',   subject: 'Setting' } },
    { method: 'getIntakeFormEndpoint',             permission: { action: 'read',   subject: 'Setting' } },
    { method: 'deleteIntakeFormEndpoint',          permission: { action: 'manage', subject: 'Setting' } },
    // ratings — tied to bookings (RECEPTIONIST/CLIENT can submit)
    { method: 'submitRatingEndpoint',              permission: { action: 'create', subject: 'Booking' } },
    { method: 'listRatingsEndpoint',               permission: { action: 'read',   subject: 'Booking' } },
    // org + booking settings
    { method: 'getOrgSettingsEndpoint',            permission: { action: 'read',   subject: 'Setting' } },
    { method: 'upsertOrgSettingsEndpoint',         permission: { action: 'update', subject: 'Setting' } },
    { method: 'getBookingSettingsEndpoint',        permission: { action: 'read',   subject: 'Setting' } },
    { method: 'upsertBookingSettingsEndpoint',     permission: { action: 'update', subject: 'Setting' } },
    { method: 'markOnboardedEndpoint',             permission: { action: 'update', subject: 'Setting' } },
    { method: 'seedVerticalEndpoint',              permission: { action: 'manage', subject: 'Setting' } },
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
});

describe('Role matrix (TAR-46) — org settings access', () => {
  const factory = new CaslAbilityFactory();
  const abilityFor = (membershipRole: string) =>
    factory.buildForUser({ membershipRole, role: null, customRole: null });

  it('OWNER can manage Service, Branding, Setting', () => {
    const a = abilityFor('OWNER');
    for (const action of ['create', 'read', 'update', 'delete'] as const) {
      expect(a.can(action, 'Service')).toBe(true);
      expect(a.can(action, 'Branding')).toBe(true);
      expect(a.can(action, 'Setting')).toBe(true);
    }
  });

  it('ADMIN can manage Service, Branding, Setting', () => {
    const a = abilityFor('ADMIN');
    for (const action of ['create', 'read', 'update', 'delete'] as const) {
      expect(a.can(action, 'Service')).toBe(true);
      expect(a.can(action, 'Branding')).toBe(true);
      expect(a.can(action, 'Setting')).toBe(true);
    }
  });

  it('RECEPTIONIST cannot read or mutate Service, Branding, or Setting', () => {
    const a = abilityFor('RECEPTIONIST');
    for (const action of ['create', 'read', 'update', 'delete'] as const) {
      expect(a.can(action, 'Service')).toBe(false);
      expect(a.can(action, 'Branding')).toBe(false);
      expect(a.can(action, 'Setting')).toBe(false);
    }
    // RECEPTIONIST can still create ratings (submitRatingEndpoint → create Booking)
    expect(a.can('create', 'Booking')).toBe(true);
  });

  it('EMPLOYEE cannot read or mutate Service, Branding, or Setting', () => {
    const a = abilityFor('EMPLOYEE');
    for (const action of ['create', 'read', 'update', 'delete'] as const) {
      expect(a.can(action, 'Service')).toBe(false);
      expect(a.can(action, 'Branding')).toBe(false);
      expect(a.can(action, 'Setting')).toBe(false);
    }
  });
});

