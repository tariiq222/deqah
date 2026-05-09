import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../../infrastructure/database';
import { TenantContextService } from '../../../../../common/tenant/tenant-context.service';
import { MoyasarApiClient } from '../../../moyasar-api/moyasar-api.client';
import { InitGuestPaymentDto } from './init-guest-payment.dto';

export interface InitGuestPaymentResult {
  paymentId: string;
  redirectUrl: string;
}

@Injectable()
export class InitGuestPaymentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly moyasar: MoyasarApiClient,
  ) {}

  async execute(dto: InitGuestPaymentDto): Promise<InitGuestPaymentResult> {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const booking = await this.prisma.booking.findFirst({
      where: { id: dto.bookingId },
      select: { id: true, status: true, price: true, currency: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${dto.bookingId} not found`);
    }

    if (booking.status !== 'AWAITING_PAYMENT') {
      throw new BadRequestException(
        `Booking ${dto.bookingId} is not awaiting payment (status: ${booking.status})`,
      );
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { bookingId: dto.bookingId },
      select: { id: true, total: true, currency: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice not found for booking ${dto.bookingId}`);
    }

    const existingPayment = await this.prisma.payment.findFirst({
      where: { idempotencyKey: `guest:${dto.bookingId}` },
    });

    if (existingPayment) {
      if (existingPayment.status === 'COMPLETED') {
        throw new ConflictException('Payment for this booking has already been completed');
      }
      return {
        paymentId: existingPayment.id,
        redirectUrl: '',
      };
    }

    const amountHalalas = Math.round(Number(invoice.total) * 100);

    const payment = await this.prisma.payment.create({
      data: {
        organizationId,
        invoiceId: invoice.id,
        amount: invoice.total,
        currency: invoice.currency,
        method: 'ONLINE_CARD',
        status: 'PENDING',
        idempotencyKey: `guest:${dto.bookingId}`,
      },
    });

    const callbackUrl = this.buildCallbackUrl(dto.bookingId);

    const moyasarPayment = await this.moyasar.createPayment(organizationId, {
      amountHalalas,
      currency: invoice.currency,
      description: `Booking payment - ${dto.bookingId}`,
      callbackUrl,
      metadata: {
        invoiceId: invoice.id,
        bookingId: dto.bookingId,
      },
    });

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayRef: moyasarPayment.id,
      },
    });

    return {
      paymentId: updatedPayment.id,
      redirectUrl: moyasarPayment.redirectUrl ?? '',
    };
  }

  private buildCallbackUrl(bookingId: string): string {
    const baseUrl = process.env['PUBLIC_WEBSITE_URL'];
    return `${baseUrl || 'http://localhost:3000'}/booking/payment-callback?bookingId=${bookingId}`;
  }
}