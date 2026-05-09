import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { toListResponse } from '../../../common/dto';
import { ListPaymentsDto } from './list-payments.dto';

export type ListPaymentsQuery = Omit<ListPaymentsDto, 'fromDate' | 'toDate'> & {
  fromDate?: Date;
  toDate?: Date;
};

@Injectable()
export class ListPaymentsHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListPaymentsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId
        ? { invoice: { clientId: query.clientId } }
        : {}),
      ...(query.fromDate || query.toDate
        ? { createdAt: { gte: query.fromDate, lte: query.toDate } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { invoice: { select: { bookingId: true, clientId: true, total: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return toListResponse(items, total, page, limit);
  }
}
