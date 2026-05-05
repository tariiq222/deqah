import {
  Controller, Get, UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse,
} from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CaslGuard } from '../../common/guards/casl.guard';
import { ApiStandardResponses } from '../../common/swagger';
import { CurrentUser, JwtUser } from '../../common/auth/current-user.decorator';
import { GetDashboardStatsHandler } from '../../modules/dashboard/get-dashboard-stats/get-dashboard-stats.handler';

@ApiTags('Dashboard / Stats')
@ApiBearerAuth()
@ApiStandardResponses()
@Controller('dashboard/stats')
@UseGuards(JwtGuard, CaslGuard)
export class DashboardStatsController {
  constructor(private readonly getStats: GetDashboardStatsHandler) {}

  @Get()
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
}
