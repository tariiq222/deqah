import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { PriceResolverService } from '../../org-experience/services/price-resolver.service';
import { GetBookingSettingsHandler } from '../get-booking-settings/get-booking-settings.handler';
import { GroupSessionMinReachedHandler } from '../group-session-min-reached/group-session-min-reached.handler';
import { EventBusService } from '../../../infrastructure/events';
import { SubscriptionCacheService } from '../../platform/billing/subscription-cache.service';
import { assertLimitNotExceeded } from '../../platform/billing/assert-limit-not-exceeded';
import { BookingCreatedEvent } from '../events/booking-created.event';
import { LaunchFlags } from '../../platform/billing/feature-flags/launch-flags';
import { ValidateCouponService } from '../coupons/validate-coupon.service';
import { CreateBookingDto } from './create-booking.dto';

/** FNV-1a 32-bit hash → signed int32 (Postgres int4 range). Same algorithm as create-zoom-meeting. */
function hashToInt32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h | 0;
}

/** Re-map a Postgres exclusion violation (23P01) to a domain 409 conflict. */
function mapDbConflict(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2010' &&
    (err.meta as Record<string, unknown> | undefined)?.['code'] === '23P01'
  ) {
    throw new ConflictException('Employee already has a booking in this time slot');
  }
  throw err;
}

const roundMoney = (amount: number): number => Number(amount.toFixed(2));

export type CreateBookingCommand = Omit<CreateBookingDto, 'scheduledAt' | 'expiresAt'> & {
  scheduledAt: Date;
  expiresAt?: Date;
};

@Injectable()
export class CreateBookingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly priceResolver: PriceResolverService,
    private readonly settingsHandler: GetBookingSettingsHandler,
    private readonly groupMinReachedHandler: GroupSessionMinReachedHandler,
    private readonly eventBus: EventBusService,
    private readonly subscriptionCache: SubscriptionCacheService,
    private readonly flags: LaunchFlags,
    private readonly couponValidator: ValidateCouponService,
  ) {}

  async execute(dto: CreateBookingCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('Booking must be scheduled in the future');
    }

    if (dto.payAtClinic) {
      const settings = await this.settingsHandler.execute({
        branchId: dto.branchId,
      });
      if (!('payAtClinicEnabled' in settings) || !(settings as Record<string, unknown>).payAtClinicEnabled) {
        throw new BadRequestException('Pay at clinic is not enabled for this branch');
      }
    }

    if ((dto.bookingType as string) === 'ONLINE') {
      // SaaS-02g: Integration.provider is now composite-unique per org; findFirst + Proxy auto-scopes.
      const zoomIntegration = await this.prisma.integration.findFirst({
        where: { provider: 'zoom' },
      });
      if (!zoomIntegration || !zoomIntegration.isActive) {
        throw new BadRequestException('Zoom integration must be configured for online bookings');
      }
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId },
      select: { id: true },
    });
    if (!service) throw new NotFoundException('Service not found');

    const employeeService = await this.prisma.employeeService.findUnique({
      where: { employeeId_serviceId: { employeeId: dto.employeeId, serviceId: dto.serviceId } },
    });
    if (!employeeService) {
      throw new BadRequestException('Employee does not provide this service');
    }

    // Resolve price + duration via PriceResolverService (3-tier: employee override → duration option → service base).
    const resolved = await this.priceResolver.resolve({
      serviceId: dto.serviceId,
      employeeServiceId: employeeService.id,
      durationOptionId: dto.durationOptionId ?? null,
      bookingType: dto.bookingType ?? null,
    });

    const durationMins = resolved.durationMins;
    const price = resolved.price;
    const currency = dto.currency ?? resolved.currency;

    const endsAt = new Date(scheduledAt.getTime() + durationMins * 60_000);

    let discountedPrice: number | null = null;

    // Resolve group-session settings from the service
    const serviceRecord = await this.prisma.service.findFirst({
      where: { id: dto.serviceId },
      select: { minParticipants: true, maxParticipants: true, reserveWithoutPayment: true },
    });
    const isGroupService =
      !!serviceRecord && serviceRecord.maxParticipants > 1 && serviceRecord.reserveWithoutPayment;

    // For group services, use PENDING_GROUP_FILL until minParticipants is reached.
    const initialStatus = isGroupService ? 'PENDING_GROUP_FILL' : 'PENDING';

    // Plan-limit recheck inside the tx closes the TOCTOU race where two
    // concurrent booking creates at maxBookingsPerMonth-1 both pass the
    // pre-create guard. Pull the cached subscription once, before the tx,
    // because SubscriptionCacheService talks to its own connection.
    const subscription = await this.subscriptionCache.get(organizationId);

    // Serializable: prevents two concurrent group-session bookings from both reading slotCount=N-1 and overflowing capacity.
    const booking = await this.prisma.$transaction(
      async (tx) => {
        if (!isGroupService) {
          // Individual bookings: hard overlap check
          const conflict = await tx.booking.findFirst({
            where: {
              organizationId,
              employeeId: dto.employeeId,
              status: { in: ['PENDING', 'CONFIRMED'] },
              scheduledAt: { lt: endsAt },
              endsAt: { gt: scheduledAt },
            },
            select: { id: true },
          });
          if (conflict) {
            throw new ConflictException('Employee already has a booking in this time slot');
          }
        } else {
          // Group bookings: serialize concurrent attempts on the same slot.
          // Same pattern as create-zoom-meeting — pg_advisory_xact_lock is held
          // until the transaction commits, preventing two clients from both
          // reading slotCount < maxParticipants and both succeeding.
          const lockKey1 = hashToInt32(`${dto.serviceId}:${dto.employeeId ?? 'noemp'}`);
          const lockKey2 = hashToInt32(scheduledAt.toISOString());
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey1}::int, ${lockKey2}::int)`;

          // Check capacity now that the lock is held
          const slotCount = await tx.booking.count({
            where: {
              organizationId,
              serviceId: dto.serviceId,
              employeeId: dto.employeeId,
              scheduledAt,
              status: { in: ['PENDING_GROUP_FILL', 'AWAITING_PAYMENT', 'CONFIRMED'] },
            },
          });
          if (slotCount >= serviceRecord!.maxParticipants) {
            throw new ConflictException('This group session is full');
          }
        }

        if (dto.couponCode) {
          if (this.flags.couponStrictEnabled) {
            const result = await this.couponValidator.validate({
              tx,
              code: dto.couponCode,
              orgId: organizationId,
              clientId: dto.clientId,
              serviceId: dto.serviceId,
              subtotal: Number(price),
            });
            discountedPrice = parseFloat((Number(price) - result.discount).toFixed(2));
            await tx.coupon.update({
              where: { id: result.couponId },
              data: { usedCount: { increment: 1 } },
            });
          } else {
            // Legacy minimal validation — use tx.coupon so reads see consistent state
            // with the rest of the transaction.
            const coupon = await tx.coupon.findFirst({ where: { code: dto.couponCode } });
            if (!coupon || !coupon.isActive) throw new BadRequestException(`Coupon ${dto.couponCode} not found`);
            if (coupon.expiresAt && coupon.expiresAt < new Date()) {
              throw new BadRequestException(`Coupon ${dto.couponCode} has expired`);
            }
            if (coupon.minOrderAmt !== null && Number(price) < Number(coupon.minOrderAmt)) {
              throw new BadRequestException(`Order total does not meet minimum for coupon`);
            }
            const discount = coupon.discountType === 'PERCENTAGE'
              ? Number(price) * Number(coupon.discountValue) / 100
              : Math.min(Number(coupon.discountValue), Number(price));
            discountedPrice = parseFloat((Number(price) - discount).toFixed(2));
          }
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
            branchId: dto.branchId,
            clientId: dto.clientId,
            employeeId: dto.employeeId,
            serviceId: dto.serviceId,
            durationOptionId: resolved.durationOptionId || null,
            scheduledAt,
            endsAt,
            durationMins,
            price,
            currency,
            bookingType: isGroupService ? 'GROUP' : (dto.bookingType ?? 'INDIVIDUAL'),
            notes: dto.notes,
            expiresAt: dto.expiresAt,
            groupSessionId: dto.groupSessionId,
            payAtClinic: dto.payAtClinic ?? false,
            couponCode: dto.couponCode ?? null,
            discountedPrice: discountedPrice,
            status: initialStatus,
            bookingNumber: nextBookingNumber,
          },
        });

        let invoice: { id: string } | null = null;
        if (!dto.payAtClinic && !isGroupService) {
          const orgSettings = await tx.organizationSettings.findFirst({
            where: { organizationId },
            select: { vatRate: true },
          });
          const vatRate = orgSettings?.vatRate ? Number(orgSettings.vatRate) : 0.15;

          const subtotal = discountedPrice ?? price;
          const vatAmt = roundMoney(subtotal * vatRate);
          const total = roundMoney(subtotal + vatAmt);

          invoice = await tx.invoice.create({
            data: {
              organizationId,
              branchId: booking.branchId,
              clientId: booking.clientId,
              employeeId: booking.employeeId,
              bookingId: booking.id,
              subtotal,
              vatRate,
              vatAmt,
              total,
              currency: booking.currency,
              status: 'ISSUED',
              issuedAt: new Date(),
            },
            select: { id: true },
          });
        }

        // Post-create plan-limit recheck — closes TOCTOU on
        // BOOKINGS_PER_MONTH. Cancelled bookings are excluded both here and in
        // the pre-create guard, so they cannot push the count past the cap.
        await assertLimitNotExceeded(
          tx,
          organizationId,
          'BOOKINGS_PER_MONTH',
          subscription?.limits,
        );

        return { ...booking, invoiceId: invoice?.id ?? null };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ).catch(mapDbConflict);

    // After insert: check if minParticipants is now reached for this slot
    if (isGroupService) {
      const filledCount = await this.prisma.booking.count({
        where: {
          serviceId: dto.serviceId,
          employeeId: dto.employeeId,
          scheduledAt,
          status: { in: ['PENDING_GROUP_FILL', 'AWAITING_PAYMENT', 'CONFIRMED'] },
        },
      });
      if (filledCount >= serviceRecord!.minParticipants) {
        // Fire-and-forget — don't fail the booking if notification fails
        this.groupMinReachedHandler.execute({
          serviceId: dto.serviceId,
          employeeId: dto.employeeId,
          scheduledAt,
        }).catch(() => { /* logged by eventBus */ });
      }
    }

    // Notify staff about new booking
    const createdEvent = new BookingCreatedEvent({
      bookingId: booking.id,
      clientId: booking.clientId,
      employeeId: booking.employeeId ?? '',
      organizationId,
      scheduledAt: booking.scheduledAt,
      serviceId: booking.serviceId,
    });
    this.eventBus.publish(createdEvent.eventName, createdEvent.toEnvelope()).catch(() => {});

    return booking;
  }
}
