import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

export interface RequestRefundCommand {
  invoiceId: string;
  clientId: string;
  reason?: string;
}

export interface RefundRequestResult {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
}

@Injectable()
export class RequestRefundHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: RequestRefundCommand): Promise<RefundRequestResult> {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: cmd.invoiceId,
        clientId: cmd.clientId,
      },
      include: {
        payments: {
          where: {
            status: 'COMPLETED',
          },
          orderBy: { processedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'PAID') {
      throw new BadRequestException('Only paid invoices can be refunded');
    }

    const completedPayment = invoice.payments[0];
    if (!completedPayment) {
      throw new BadRequestException('No completed payment found for this invoice');
    }

    const existingRequest = await this.prisma.refundRequest.findFirst({
      where: {
        invoiceId: cmd.invoiceId,
        status: { in: ['PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED'] },
      },
    });

    if (existingRequest) {
      throw new ConflictException('A refund request already exists for this invoice');
    }

    const refundRequest = await this.prisma.refundRequest.create({
      data: {
        organizationId,
        invoiceId: cmd.invoiceId,
        paymentId: completedPayment.id,
        clientId: cmd.clientId,
        amount: completedPayment.amount,
        reason: cmd.reason,
        status: 'PENDING_REVIEW',
      },
    });

    return {
      id: refundRequest.id,
      status: refundRequest.status,
      amount: Number(refundRequest.amount),
      createdAt: refundRequest.createdAt.toISOString(),
    };
  }
}