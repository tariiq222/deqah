import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface EmployeeStatsResult {
  total: number;
  active: number;
  inactive: number;
  avgRating: number | null;
}

@Injectable()
export class EmployeeStatsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<EmployeeStatsResult> {
    const [total, active, ratingAgg] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.employee.count({ where: { isActive: true } }),
      this.prisma.rating.aggregate({ _avg: { score: true } }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      avgRating: ratingAgg._avg.score,
    };
  }
}
