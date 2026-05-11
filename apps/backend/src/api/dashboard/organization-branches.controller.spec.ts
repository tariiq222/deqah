import { DashboardOrganizationBranchesController } from './organization-branches.controller';
import { REQUIRE_FEATURE_KEY } from '../../modules/platform/billing/feature.decorator';
import { FeatureKey } from '@deqah/shared/constants/feature-keys';
import { CHECK_PERMISSIONS_KEY, type RequiredPermission } from '../../common/guards/casl.guard';
import { CaslAbilityFactory } from '../../modules/identity/casl/casl-ability.factory';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const createBranch = fn({ id: 'br-1' });
  const listBranches = fn({ data: [] });
  const getBranch = fn({ id: 'br-1' });
  const updateBranch = fn({ id: 'br-1' });
  const deleteBranch = fn({ id: 'br-1' });
  const listBranchEmployees = fn([]);
  const assignEmployee = fn({ id: 'asg-1' });
  const unassignEmployee = fn({ id: 'asg-1' });
  const controller = new DashboardOrganizationBranchesController(
    createBranch as never, updateBranch as never, listBranches as never, getBranch as never,
    deleteBranch as never, listBranchEmployees as never,
    assignEmployee as never, unassignEmployee as never,
  );
  return {
    controller, createBranch, listBranches, getBranch, updateBranch,
    deleteBranch, listBranchEmployees, assignEmployee, unassignEmployee,
  };
}

describe('DashboardOrganizationBranchesController', () => {
  it('createBranchEndpoint — passes body', async () => {
    const { controller, createBranch } = buildController();
    await controller.createBranchEndpoint({ nameAr: 'فرع' } as never);
    expect(createBranch.execute).toHaveBeenCalled();
  });

  it('listBranchesEndpoint — passes query', async () => {
    const { controller, listBranches } = buildController();
    await controller.listBranchesEndpoint({} as never);
    expect(listBranches.execute).toHaveBeenCalled();
  });

  it('getBranchEndpoint — passes branchId', async () => {
    const { controller, getBranch } = buildController();
    await controller.getBranchEndpoint('br-1');
    expect(getBranch.execute).toHaveBeenCalledWith({ branchId: 'br-1' });
  });

  it('updateBranchEndpoint — passes branchId', async () => {
    const { controller, updateBranch } = buildController();
    await controller.updateBranchEndpoint('br-1', {} as never);
    expect(updateBranch.execute).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br-1' }),
    );
  });

  it('deleteBranchEndpoint — passes branchId', async () => {
    const { controller, deleteBranch } = buildController();
    await controller.deleteBranchEndpoint('br-1');
    expect(deleteBranch.execute).toHaveBeenCalledWith({ branchId: 'br-1' });
  });

  it('listBranchEmployeesEndpoint — passes branchId', async () => {
    const { controller, listBranchEmployees } = buildController();
    await controller.listBranchEmployeesEndpoint('br-1');
    expect(listBranchEmployees.execute).toHaveBeenCalledWith({ branchId: 'br-1' });
  });

  it('assignEmployeeEndpoint — passes branchId and employeeId', async () => {
    const { controller, assignEmployee } = buildController();
    await controller.assignEmployeeEndpoint('br-1', { employeeId: 'emp-1' } as never);
    expect(assignEmployee.execute).toHaveBeenCalledWith({
      branchId: 'br-1', employeeId: 'emp-1',
    });
  });

  it('unassignEmployeeEndpoint — passes branchId and employeeId', async () => {
    const { controller, unassignEmployee } = buildController();
    await controller.unassignEmployeeEndpoint('br-1', 'emp-1');
    expect(unassignEmployee.execute).toHaveBeenCalledWith({
      branchId: 'br-1', employeeId: 'emp-1',
    });
  });
});

describe('@RequireFeature metadata — MULTI_BRANCH', () => {
  it.each([
    'createBranchEndpoint',
    'updateBranchEndpoint',
  ])('annotates %s with FeatureKey.MULTI_BRANCH', (method) => {
    const meta = Reflect.getMetadata(
      REQUIRE_FEATURE_KEY,
      (DashboardOrganizationBranchesController.prototype as unknown as Record<string, unknown>)[method] as object,
    );
    expect(meta).toBe(FeatureKey.MULTI_BRANCH);
  });
});

// ── CASL permission decorator coverage (TAR-46) ────────────────────────────
describe('@CheckPermissions decorator coverage (TAR-46)', () => {
  const PROTOTYPE = DashboardOrganizationBranchesController.prototype as unknown as Record<string, unknown>;
  const expected: Array<{ method: string; permission: RequiredPermission }> = [
    { method: 'createBranchEndpoint',         permission: { action: 'create', subject: 'Branch' } },
    { method: 'listBranchesEndpoint',         permission: { action: 'read',   subject: 'Branch' } },
    { method: 'getBranchEndpoint',            permission: { action: 'read',   subject: 'Branch' } },
    { method: 'updateBranchEndpoint',         permission: { action: 'update', subject: 'Branch' } },
    { method: 'deleteBranchEndpoint',         permission: { action: 'delete', subject: 'Branch' } },
    { method: 'listBranchEmployeesEndpoint',  permission: { action: 'read',   subject: 'Branch' } },
    { method: 'assignEmployeeEndpoint',       permission: { action: 'update', subject: 'Branch' } },
    { method: 'unassignEmployeeEndpoint',     permission: { action: 'update', subject: 'Branch' } },
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

describe('Role matrix (TAR-46) — branch access', () => {
  const factory = new CaslAbilityFactory();
  const abilityFor = (membershipRole: string) =>
    factory.buildForUser({ membershipRole, role: null, customRole: null });

  it('OWNER and ADMIN can manage Branch fully', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      const a = abilityFor(role);
      for (const action of ['create', 'read', 'update', 'delete'] as const) {
        expect(a.can(action, 'Branch')).toBe(true);
      }
    }
  });

  it('RECEPTIONIST and EMPLOYEE cannot touch Branch', () => {
    for (const role of ['RECEPTIONIST', 'EMPLOYEE'] as const) {
      const a = abilityFor(role);
      for (const action of ['create', 'read', 'update', 'delete'] as const) {
        expect(a.can(action, 'Branch')).toBe(false);
      }
    }
  });
});

