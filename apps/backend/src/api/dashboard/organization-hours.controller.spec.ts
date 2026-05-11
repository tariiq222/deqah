import { ParseUUIDPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { DashboardOrganizationHoursController } from './organization-hours.controller';
import { CHECK_PERMISSIONS_KEY, type RequiredPermission } from '../../common/guards/casl.guard';
import { CaslAbilityFactory } from '../../modules/identity/casl/casl-ability.factory';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const setBusinessHours = fn({ id: 'h-1' });
  const getBusinessHours = fn({ id: 'h-1' });
  const addHoliday = fn({ id: 'hol-1' });
  const removeHoliday = fn({ id: 'hol-1' });
  const listHolidays = fn({ data: [] });
  const controller = new DashboardOrganizationHoursController(
    setBusinessHours as never, getBusinessHours as never, addHoliday as never,
    removeHoliday as never, listHolidays as never,
  );
  return { controller, setBusinessHours, getBusinessHours, addHoliday, removeHoliday, listHolidays };
}

describe('DashboardOrganizationHoursController', () => {
  it('setBusinessHoursEndpoint — passes body', async () => {
    const { controller, setBusinessHours } = buildController();
    await controller.setBusinessHoursEndpoint({ branchId: 'br-1' } as never);
    expect(setBusinessHours.execute).toHaveBeenCalled();
  });

  it('getBusinessHoursEndpoint — passes branchId', async () => {
    const { controller, getBusinessHours } = buildController();
    await controller.getBusinessHoursEndpoint('br-1');
    expect(getBusinessHours.execute).toHaveBeenCalledWith({ branchId: 'br-1' });
  });

  it('addHolidayEndpoint — passes body', async () => {
    const { controller, addHoliday } = buildController();
    await controller.addHolidayEndpoint({ nameAr: 'عيد' } as never);
    expect(addHoliday.execute).toHaveBeenCalled();
  });

  it('removeHolidayEndpoint — passes holidayId', async () => {
    const { controller, removeHoliday } = buildController();
    await controller.removeHolidayEndpoint('hol-1');
    expect(removeHoliday.execute).toHaveBeenCalledWith({ holidayId: 'hol-1' });
  });

  it('listHolidaysEndpoint — passes query', async () => {
    const { controller, listHolidays } = buildController();
    await controller.listHolidaysEndpoint({} as never);
    expect(listHolidays.execute).toHaveBeenCalled();
  });

  it('getBusinessHoursEndpoint — does not require UUID branch ids', () => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      DashboardOrganizationHoursController,
      'getBusinessHoursEndpoint',
    ) as Record<string, { pipes?: unknown[] }> | undefined;
    const pipes = Object.values(metadata ?? {}).flatMap((entry) => entry.pipes ?? []);

    expect(pipes).not.toContain(ParseUUIDPipe);
  });
});

// ── CASL permission decorator coverage (TAR-46) ────────────────────────────
describe('@CheckPermissions decorator coverage (TAR-46)', () => {
  const PROTOTYPE = DashboardOrganizationHoursController.prototype as unknown as Record<string, unknown>;
  const expected: Array<{ method: string; permission: RequiredPermission }> = [
    { method: 'setBusinessHoursEndpoint',  permission: { action: 'update', subject: 'Setting' } },
    { method: 'getBusinessHoursEndpoint',  permission: { action: 'read',   subject: 'Setting' } },
    { method: 'addHolidayEndpoint',        permission: { action: 'update', subject: 'Setting' } },
    { method: 'removeHolidayEndpoint',     permission: { action: 'update', subject: 'Setting' } },
    { method: 'listHolidaysEndpoint',      permission: { action: 'read',   subject: 'Setting' } },
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

describe('Role matrix (TAR-46) — business hours / holidays access', () => {
  const factory = new CaslAbilityFactory();
  const abilityFor = (membershipRole: string) =>
    factory.buildForUser({ membershipRole, role: null, customRole: null });

  it('OWNER and ADMIN can manage Setting fully', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      const a = abilityFor(role);
      for (const action of ['create', 'read', 'update', 'delete'] as const) {
        expect(a.can(action, 'Setting')).toBe(true);
      }
    }
  });

  it('RECEPTIONIST and EMPLOYEE cannot read or mutate Setting', () => {
    for (const role of ['RECEPTIONIST', 'EMPLOYEE'] as const) {
      const a = abilityFor(role);
      for (const action of ['create', 'read', 'update', 'delete'] as const) {
        expect(a.can(action, 'Setting')).toBe(false);
      }
    }
  });
});

