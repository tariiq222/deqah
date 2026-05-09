import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface GetInvoiceQuery {
  invoiceId: string;
}

@Injectable()
export class GetInvoiceHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetInvoiceQuery) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: query.invoiceId },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${query.invoiceId} not found`);
    }
    return invoice;
  }
}
