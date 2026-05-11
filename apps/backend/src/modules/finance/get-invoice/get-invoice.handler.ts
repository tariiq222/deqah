import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface GetInvoiceQuery {
  invoiceId: string;
  /** When provided, the handler verifies the invoice belongs to this client. */
  clientId?: string;
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
    if (query.clientId && invoice.clientId !== query.clientId) {
      throw new ForbiddenException('Invoice does not belong to this client');
    }
    return invoice;
  }
}
