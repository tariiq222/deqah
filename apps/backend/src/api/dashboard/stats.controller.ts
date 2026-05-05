import {
  Controller, ForbiddenException, Get, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse,
} from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard, CheckPermissions } from '../../common/guards/casl.guard';
import { ApiStandardResponses } from '../../common/swagger';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { GetDashboardStatsHandler } from '../../modules/dashboard/get-dashboard-stats/get-dashboard-stats.handler';
import { GetTopPerformersHandler } from '../../modules/dashboard/get-top-performers/get-top-performers.handler';
import { GetTopPerformersDto } from '../../modules/dashboard/get-top-performers/get-top-performers.dto';

@ApiTags('Dashboard / Stats')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('dashboard')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardStatsController {
  constructor(
    private readonly getStats: GetDashboardStatsHandler,
    private readonly getTopPerformers: GetTopPerformersHandler,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard home page statistics for today' })
  @ApiOkResponse({
    description: 'Dashboard statistics aggregated for today',
    schema: {
      type: 'object',
      properties: {
        todayBookings: { type: 'number' },
        pendingBookings: { type: 'number' },
        completedToday: { type: 'number' },
        revenueToday: { type: 'number' },
        activeClients: { type: 'number' },
        newClientsThisMonth: { type: 'number' },
      },
    },
  })
  getStatsEndpoint(@CurrentUser() user: JwtUser) {
    return this.getStats.execute({
      membershipRole: user.membershipRole ?? null,
      userId: user.sub,
    });
  }

  @Get('top-performers')
  @CheckPermissions({ action: 'read', subject: 'Report' })
  @ApiOperation({ summary: 'Get top-performing employees by revenue (current month)' })
  @ApiOkResponse({
    description: 'Ranked list of employees by revenue for the current period',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          employeeId: { type: 'string' },
          name: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          revenue: { type: 'number' },
          bookings: { type: 'number' },
        },
      },
    },
  })
  async topPerformers(
    @CurrentUser() user: JwtUser,
    @Query() dto: GetTopPerformersDto,
  ) {
    if (user.membershipRole === 'ACCOUNTANT') {
      throw new ForbiddenException('Performance metrics are not available to this role');
    }
    return this.getTopPerformers.execute({ period: dto.period ?? 'month' });
  }
}
