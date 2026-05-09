import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';

export interface PaymentStats {
  total: number;
  totalAmount: number;
  completed: number;
  completedAmount: number;
  pending: number;
  pendingAmount: number;
  pendingVerification: number;
  pendingVerificationAmount: number;
  refunded: number;
  refundedAmount: number;
  failed: number;
}

@Injectable()
export class GetPaymentStatsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<PaymentStats> {
    const rows = await this.prisma.payment.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { amount: true },
    });

    const stats: PaymentStats = {
      total: 0,
      totalAmount: 0,
      completed: 0,
      completedAmount: 0,
      pending: 0,
      pendingAmount: 0,
      pendingVerification: 0,
      pendingVerificationAmount: 0,
      refunded: 0,
      refundedAmount: 0,
      failed: 0,
    };

    for (const row of rows) {
      const count = (row._count as { id: number }).id;
      const amount = (row._sum as { amount: { toNumber(): number } | null }).amount?.toNumber() ?? 0;
      stats.total += count;
      stats.totalAmount += amount;

      if (row.status === PaymentStatus.COMPLETED) {
        stats.completed = count;
        stats.completedAmount = amount;
      } else if (row.status === PaymentStatus.PENDING) {
        stats.pending = count;
        stats.pendingAmount = amount;
      } else if (row.status === PaymentStatus.PENDING_VERIFICATION) {
        stats.pendingVerification = count;
        stats.pendingVerificationAmount = amount;
      } else if (row.status === PaymentStatus.REFUNDED) {
        stats.refunded = count;
        stats.refundedAmount = amount;
      } else if (row.status === PaymentStatus.FAILED) {
        stats.failed = count;
      }
    }

    return stats;
  }
}
