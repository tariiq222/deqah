import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { MinioService } from '../../../infrastructure/storage/minio.service';
import { BankTransferUploadDto } from './bank-transfer-upload.dto';

const RECEIPTS_BUCKET = 'finance-receipts';
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export type BankTransferUploadCommand = BankTransferUploadDto & {
  fileBuffer: Buffer;
  mimetype: string;
  filename: string;
};

@Injectable()
export class BankTransferUploadHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly storage: MinioService,
  ) {}

  async execute(cmd: BankTransferUploadCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    if (!ALLOWED_MIME_TYPES.has(cmd.mimetype)) {
      throw new BadRequestException(`File type ${cmd.mimetype} not allowed. Use JPEG, PNG, WebP, or PDF.`);
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: cmd.invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${cmd.invoiceId} not found`);
    }

    const ext = cmd.filename.split('.').pop() ?? 'bin';
    const key = `${cmd.invoiceId}/${Date.now()}.${ext}`;

    const receiptUrl = await this.storage.uploadFile(RECEIPTS_BUCKET, key, cmd.fileBuffer, cmd.mimetype);

    const payment = await this.prisma.payment.create({
      data: {
        organizationId,
        invoiceId: cmd.invoiceId,
        amount: cmd.amount,
        currency: invoice.currency,
        method: PaymentMethod.BANK_TRANSFER,
        status: PaymentStatus.PENDING_VERIFICATION,
        receiptUrl,
      },
    });

    return payment;
  }
}
