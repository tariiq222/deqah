import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { CreateInvoiceDto } from './create-invoice.dto';

const DEFAULT_VAT_RATE = 0.15;

export type CreateInvoiceCommand = Omit<CreateInvoiceDto, 'dueAt'> & {
  dueAt?: Date;
};

@Injectable()
export class CreateInvoiceHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(dto: CreateInvoiceCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();

    const subtotal = dto.subtotal;
    const discountAmt = dto.discountAmt ?? 0;
    const vatRate = dto.vatRate ?? DEFAULT_VAT_RATE;
    const vatBase = subtotal - discountAmt;
    const vatAmt = parseFloat((vatBase * vatRate).toFixed(2));
    const total = parseFloat((vatBase + vatAmt).toFixed(2));

    const existing = await this.prisma.invoice.findUnique({
      where: { bookingId: dto.bookingId ?? '' },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'INVOICE_ALREADY_EXISTS',
        bookingId: dto.bookingId,
        invoiceId: existing.id,
      });
    }

    let invoice;
    try {
      invoice = await this.prisma.invoice.create({
        data: {
          organizationId,
          branchId: dto.branchId,
          clientId: dto.clientId,
          employeeId: dto.employeeId,
          bookingId: dto.bookingId,
          subtotal,
          discountAmt,
          vatRate,
          vatAmt,
          total,
          notes: dto.notes,
          dueAt: dto.dueAt,
          status: 'ISSUED',
          issuedAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'INVOICE_ALREADY_EXISTS',
          bookingId: dto.bookingId,
        });
      }
      throw err;
    }

    await this.eventBus.publish('finance.invoice.created', {
      eventId: invoice.id,
      source: 'finance',
      version: 1,
      occurredAt: new Date(),
      payload: {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        bookingId: invoice.bookingId,
        clientId: invoice.clientId,
        total: Number(invoice.total),
      },
    });

    return invoice;
  }
}
