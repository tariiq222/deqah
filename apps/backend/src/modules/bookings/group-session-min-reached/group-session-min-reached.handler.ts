import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { GroupSessionMinReachedEvent } from '../events/group-session-min-reached.event';

export interface GroupSessionMinReachedCommand {
  serviceId: string;
  employeeId: string;
  scheduledAt: Date;
}

/**
 * Fires when the number of PENDING_GROUP_FILL bookings for a slot reaches
 * the service's minParticipants threshold.
 *
 * Transitions all matching bookings to AWAITING_PAYMENT and emits
 * GroupSessionMinReachedEvent so the notifications module can send
 * payment links to each client.
 *
 * The 24-hour payment window is enforced by ExpireBookingHandler, which now
 * also handles AWAITING_PAYMENT bookings whose expiresAt has passed.
 */
@Injectable()
export class GroupSessionMinReachedHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
  ) {}

  async execute(cmd: GroupSessionMinReachedCommand): Promise<void> {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
    const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS);
    const groupSessionKey = `${cmd.employeeId}:${cmd.serviceId}:${cmd.scheduledAt.toISOString()}`;

    // Find all PENDING_GROUP_FILL bookings for this slot
    const bookings = await this.prisma.booking.findMany({
      where: {
        serviceId: cmd.serviceId,
        employeeId: cmd.employeeId,
        scheduledAt: cmd.scheduledAt,
        status: BookingStatus.PENDING_GROUP_FILL,
      },
      select: { id: true },
    });

    if (bookings.length === 0) return;

    const bookingIds = bookings.map((b) => b.id);

    await this.rlsTx.withTransaction((tx) => Promise.all([
      tx.booking.updateMany({
        where: { id: { in: bookingIds } },
        data: {
          status: BookingStatus.AWAITING_PAYMENT,
          expiresAt,
        },
      }),
      ...bookingIds.map((bookingId) =>
        tx.bookingStatusLog.create({
          data: {
            organizationId,
            bookingId,
            fromStatus: BookingStatus.PENDING_GROUP_FILL,
            toStatus: BookingStatus.AWAITING_PAYMENT,
            changedBy: 'system',
            reason: 'Group session minimum participants reached',
          },
        }),
      ),
    ]));

    const event = new GroupSessionMinReachedEvent({
      serviceId: cmd.serviceId,
      groupSessionKey,
      bookingIds,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());
  }
}
