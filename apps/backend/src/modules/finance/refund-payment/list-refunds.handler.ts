import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface RefundRequestListItem {
  id: string;
  invoiceId: string;
  paymentId: string;
  clientId: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: string;
  processedAt: string | null;
  denialReason: string | null;
}

@Injectable()
export class ListRefundsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(status?: string): Promise<RefundRequestListItem[]> {
    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const refunds = await this.prisma.refundRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return refunds.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      paymentId: r.paymentId,
      clientId: r.clientId,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
      denialReason: r.denialReason,
    }));
  }
}