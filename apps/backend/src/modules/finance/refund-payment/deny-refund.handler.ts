import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface DenyRefundCommand {
  refundRequestId: string;
  deniedBy: string;
  reason: string;
}

@Injectable()
export class DenyRefundHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: DenyRefundCommand) {
    const refundRequest = await this.prisma.refundRequest.findFirst({
      where: {
        id: cmd.refundRequestId,
        status: 'PENDING_REVIEW',
      },
    });

    if (!refundRequest) {
      throw new NotFoundException('Refund request not found or not pending review');
    }

    return this.prisma.refundRequest.update({
      where: { id: cmd.refundRequestId },
      data: {
        status: 'DENIED',
        processedBy: cmd.deniedBy,
        processedAt: new Date(),
        denialReason: cmd.reason,
      },
    });
  }
}