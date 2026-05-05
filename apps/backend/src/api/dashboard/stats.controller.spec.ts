import { DashboardStatsController } from './stats.controller';
import type { JwtUser } from '../../common/auth/current-user.decorator';
import type { GetTopPerformersDto } from '../../modules/dashboard/get-top-performers/get-top-performers.dto';

const fn = <T = unknown>(val: T = {} as T) => ({ execute: jest.fn().mockResolvedValue(val) });

function buildController() {
  const getStats = fn({
    todayBookings: 5,
    confirmedToday: 3,
    pendingToday: 2,
    pendingPayments: 1,
    cancelRequests: 0,
    todayRevenue: 450.0,
  });
  const getTopPerformers = fn([] as unknown);
  const controller = new DashboardStatsController(getStats as never, getTopPerformers as never);
  return { controller, getStats, getTopPerformers };
}

const buildUser = (membershipRole: string | null = 'OWNER', sub = 'user-1'): JwtUser => ({
  sub,
  roles: [],
  permissions: [],
  membershipRole,
});

describe('DashboardStatsController', () => {
  it('getStatsEndpoint — delegates to handler with command', async () => {
    const { controller, getStats } = buildController();
    await controller.getStatsEndpoint(buildUser('OWNER'));
    expect(getStats.execute).toHaveBeenCalledWith({
      membershipRole: 'OWNER',
      userId: 'user-1',
    });
  });

  it('getStatsEndpoint — returns the stats from the handler', async () => {
    const { controller, getStats } = buildController();
    const result = await controller.getStatsEndpoint(buildUser('OWNER'));
    expect(result).toEqual({
      todayBookings: 5,
      confirmedToday: 3,
      pendingToday: 2,
      pendingPayments: 1,
      cancelRequests: 0,
      todayRevenue: 450.0,
    });
    expect(getStats.execute).toHaveBeenCalled();
  });

  it('getStatsEndpoint — propagates handler errors', async () => {
    const { controller, getStats } = buildController();
    getStats.execute.mockRejectedValue(new Error('DB error'));
    await expect(
      controller.getStatsEndpoint(buildUser('OWNER')),
    ).rejects.toThrow('DB error');
  });

  it('rejects ACCOUNTANT from /top-performers', async () => {
    const { controller } = buildController();
    const user = buildUser('ACCOUNTANT');
    await expect(
      controller.topPerformers(user, {} as GetTopPerformersDto),
    ).rejects.toThrow('Performance metrics');
  });

  it('calls handler for OWNER on /top-performers', async () => {
    const { controller, getTopPerformers } = buildController();
    const user = buildUser('OWNER');
    getTopPerformers.execute.mockResolvedValue([] as never);
    const result = await controller.topPerformers(user, { period: 'month' } as GetTopPerformersDto);
    expect(getTopPerformers.execute).toHaveBeenCalledWith({ period: 'month' });
    expect(result).toEqual([]);
  });
});
