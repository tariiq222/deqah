import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { PriceResolverService } from '../../org-experience/services/price-resolver.service';
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { SubscriptionCacheService } from '../../platform/billing/subscription-cache.service';
import { assertLimitNotExceeded } from '../../platform/billing/assert-limit-not-exceeded';
import { CreateGuestBookingDto } from './create-guest-booking.dto';
import type { OtpChannel } from '@prisma/client';

export type CreateGuestBookingCommand = CreateGuestBookingDto & {
  identifier: string;
  sessionJti: string;
  sessionExp: number;
  sessionChannel: OtpChannel;
};

const DEFAULT_VAT_RATE = 0.15;

@Injectable()
export class CreateGuestBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly priceResolver: PriceResolverService,
    private readonly settingsHandler: GetBookingSettingsHandler,
    private readonly subscriptionCache: SubscriptionCacheService,
  ) {}

  async execute(cmd: CreateGuestBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const scheduledAt = new Date(cmd.startsAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('Booking must be scheduled in the future');
    }

    // Fix B — identifier match: session.identifier must equal the contact being booked
    const identifierMatchesEmail = cmd.sessionChannel === 'EMAIL' && cmd.identifier === cmd.client.email;
    const identifierMatchesPhone = cmd.sessionChannel === 'SMS' && cmd.identifier === cmd.client.phone;
    if (!identifierMatchesEmail && !identifierMatchesPhone) {
      throw new UnauthorizedException('Session identifier does not match booking contact');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: cmd.branchId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const employee = await this.prisma.employee.findFirst({
      where: { id: cmd.employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    // Fix D — employee must belong to the requested branch
    const employeeBranch = await this.prisma.employeeBranch.findUnique({
      where: {
        employeeId_branchId: { employeeId: cmd.employeeId, branchId: cmd.branchId },
      },
      select: { id: true },
    });
    if (!employeeBranch) {
      throw new BadRequestException('Employee is not assigned to this branch');
    }

    const service = await this.prisma.service.findFirst({
      where: { id: cmd.serviceId },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    const employeeService = await this.prisma.employeeService.findUnique({
      where: { employeeId_serviceId: { employeeId: cmd.employeeId, serviceId: cmd.serviceId } },
    });
    if (!employeeService) {
      throw new BadRequestException('Employee does not provide this service');
    }

    const resolved = await this.priceResolver.resolve({
      serviceId: cmd.serviceId,
      employeeServiceId: employeeService.id,
      durationOptionId: null,
      bookingType: null,
    });

    const durationMins = resolved.durationMins;
    const price = resolved.price;
    const currency = resolved.currency;
    const endsAt = new Date(scheduledAt.getTime() + durationMins * 60_000);

    // Pull cached plan limits BEFORE the tx (cache uses its own connection).
    const subscription = await this.subscriptionCache.get(organizationId);

    const result = await this.prisma.$transaction(async (tx) => {
      // Fix A — enforce single-use: insert UsedOtpSession or throw if already exists
      try {
        await tx.usedOtpSession.create({
          data: {
            jti: cmd.sessionJti,
            organizationId,
            expiresAt: new Date(cmd.sessionExp * 1000),
          },
        });
      } catch {
        throw new UnauthorizedException('OTP session already used');
      }

      const conflict = await tx.booking.findFirst({
        where: {
          organizationId,
          employeeId: cmd.employeeId,
          status: { in: ['PENDING', 'CONFIRMED', 'AWAITING_PAYMENT'] },
          scheduledAt: { lt: endsAt },
          endsAt: { gt: scheduledAt },
        },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException('Employee already has a booking in this time slot');
      }

      let client = await tx.client.findFirst({
        where: {
          organizationId,
          OR: [{ phone: cmd.client.phone }, { email: cmd.client.email }],
        },
      });

      const now = new Date();

      if (!client) {
        client = await tx.client.create({
          data: {
            organizationId,
            name: cmd.client.name,
            phone: cmd.client.phone,
            email: cmd.client.email,
            gender: cmd.client.gender,
            emailVerified: now,
            source: 'ONLINE',
            accountType: 'WALK_IN',
          },
        });
      } else {
        await tx.client.update({
          where: { id: client.id },
          data: {
            name: cmd.client.name,
            gender: cmd.client.gender ?? client.gender,
          },
        });
      }

      const lastBooking = await tx.booking.findFirst({
        where: { organizationId },
        orderBy: { bookingNumber: 'desc' },
        select: { bookingNumber: true },
      });
      const nextBookingNumber = (lastBooking?.bookingNumber ?? 0) + 1;

      const booking = await tx.booking.create({
        data: {
          organizationId,
          branchId: cmd.branchId,
          clientId: client.id,
          employeeId: cmd.employeeId,
          serviceId: cmd.serviceId,
          durationOptionId: resolved.durationOptionId || null,
          scheduledAt,
          endsAt,
          durationMins,
          price,
          currency,
          bookingType: 'INDIVIDUAL',
          notes: cmd.client.notes,
          status: 'AWAITING_PAYMENT',
          bookingNumber: nextBookingNumber,
        },
      });

      const subtotal = Number(price);
      const vatAmt = parseFloat((subtotal * DEFAULT_VAT_RATE).toFixed(2));
      const total = subtotal + vatAmt;

      const invoice = await tx.invoice.create({
        data: {
          organizationId, // SaaS-02e — resolves TODO(02d→02e)
          branchId: cmd.branchId,
          clientId: client.id,
          employeeId: cmd.employeeId,
          bookingId: booking.id,
          subtotal,
          discountAmt: 0,
          vatRate: DEFAULT_VAT_RATE,
          vatAmt,
          total,
          status: 'ISSUED',
          issuedAt: now,
        },
      });

      // Post-create plan-limit recheck — closes TOCTOU on BOOKINGS_PER_MONTH.
      await assertLimitNotExceeded(
        tx,
        organizationId,
        'BOOKINGS_PER_MONTH',
        subscription?.limits,
      );

      return { bookingId: booking.id, invoiceId: invoice.id, totalHalalat: Math.round(total * 100) };
    });

    return result;
  }
}
