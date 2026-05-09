import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database';
import { TenantContextService } from '../../../../../common/tenant/tenant-context.service';
import { MoyasarApiClient } from '../../../moyasar-api/moyasar-api.client';
import { InitClientPaymentDto } from './init-client-payment.dto';

const PAYMENT_INIT_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.AWAITING_PAYMENT,
];

export type InitClientPaymentCommand = InitClientPaymentDto & {
  clientId: string;
};

export interface InitClientPaymentResult {
  paymentId: string;
  redirectUrl: string;
}

@Injectable()
export class InitClientPaymentHandler {
  private readonly logger = new Logger(InitClientPaymentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly moyasar: MoyasarApiClient,
  ) {}

  async execute(cmd: InitClientPaymentCommand): Promise<InitClientPaymentResult> {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: cmd.invoiceId },
      select: { id: true, clientId: true, bookingId: true, total: true, currency: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${cmd.invoiceId} not found`);
    }
    if (invoice.clientId !== cmd.clientId) {
      throw new ForbiddenException('Invoice does not belong to this client');
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: invoice.bookingId },
      select: { id: true, status: true },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${invoice.bookingId} not found`);
    }
    if (!PAYMENT_INIT_BOOKING_STATUSES.includes(booking.status)) {
      throw new BadRequestException(
        `Booking ${invoice.bookingId} cannot initialize payment in status ${booking.status}`,
      );
    }

    const idempotencyKey = `client:${invoice.id}`;
    const existingPayment = await this.prisma.payment.findFirst({
      where: { idempotencyKey },
      select: { id: true, status: true, gatewayRef: true },
    });

    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.COMPLETED) {
        throw new ConflictException('Payment for this invoice has already been completed');
      }
      if (!existingPayment.gatewayRef) {
        await this.prisma.payment.delete({ where: { id: existingPayment.id } });
      } else {
        return {
          paymentId: existingPayment.id,
          redirectUrl: '',
        };
      }
    }

    const amountHalalas = Math.round(Number(invoice.total) * 100);
    const payment = await this.prisma.payment.create({
      data: {
        organizationId,
        invoiceId: invoice.id,
        amount: invoice.total,
        currency: invoice.currency,
        method: PaymentMethod.ONLINE_CARD,
        status: PaymentStatus.PENDING,
        idempotencyKey,
      },
      select: { id: true },
    });

    let moyasarPayment: Awaited<ReturnType<MoyasarApiClient['createPayment']>>;
    try {
      moyasarPayment = await this.moyasar.createPayment(organizationId, {
        amountHalalas,
        currency: invoice.currency,
        description: `Invoice payment - ${invoice.id}`,
        callbackUrl: this.buildCallbackUrl(invoice.bookingId, invoice.id),
        metadata: {
          invoiceId: invoice.id,
          bookingId: invoice.bookingId,
          source: 'mobile-client',
        },
      });
    } catch (error) {
      await this.deleteFailedPaymentInit(payment.id);
      if (error instanceof Error) {
        this.logger.error(`Moyasar payment creation failed for payment ${payment.id}`, error.stack);
      }
      throw error;
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayRef: moyasarPayment.id },
      select: { id: true },
    });

    return {
      paymentId: updatedPayment.id,
      redirectUrl: moyasarPayment.redirectUrl ?? '',
    };
  }

  private async deleteFailedPaymentInit(paymentId: string): Promise<void> {
    try {
      await this.prisma.payment.delete({ where: { id: paymentId } });
    } catch (error) {
      this.logger.error(
        `Failed to delete client payment ${paymentId} after Moyasar failure`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private buildCallbackUrl(bookingId: string, invoiceId: string): string {
    const baseUrl = process.env['PUBLIC_WEBSITE_URL'];
    const fallbackUrl = 'http://localhost:3000';
    return `${baseUrl || fallbackUrl}/booking/payment-callback?bookingId=${bookingId}&invoiceId=${invoiceId}`;
  }
}
