import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BookingStatus, GroupSessionStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';

interface BookGroupSessionCommand {
  groupSessionId: string;
  clientId: string;
}

export interface BookGroupSessionResult {
  type: 'BOOKED' | 'WAITLISTED';
  bookingId?: string;
  waitlistPosition?: number;
}

@Injectable()
export class BookGroupSessionHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: BookGroupSessionCommand): Promise<BookGroupSessionResult> {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const session = await this.prisma.groupSession.findFirst({
      where: {
        id: cmd.groupSessionId,
        isPublic: true,
        status: GroupSessionStatus.OPEN,
      },
    });

    if (!session) {
      throw new NotFoundException('Group session not found');
    }

    if (session.scheduledAt <= new Date()) {
      throw new BadRequestException('Group session has already started');
    }

    const existingEnrollment = await this.prisma.groupEnrollment.findUnique({
      where: {
        groupSessionId_clientId: {
          groupSessionId: cmd.groupSessionId,
          clientId: cmd.clientId,
        },
      },
    });

    if (existingEnrollment) {
      throw new ConflictException('Already enrolled in this group session');
    }

    const existingWaitlist = await this.prisma.groupSessionWaitlist.findUnique({
      where: {
        groupSessionId_clientId: {
          groupSessionId: cmd.groupSessionId,
          clientId: cmd.clientId,
        },
      },
    });

    if (existingWaitlist) {
      throw new ConflictException('Already on the waitlist for this group session');
    }

    const spotsLeft = session.maxCapacity - session.enrolledCount;

    if (spotsLeft > 0) {
      return this.createBooking(cmd.clientId, session, organizationId);
    } else if (session.waitlistEnabled) {
      return this.addToWaitlist(cmd.clientId, session, organizationId);
    } else {
      throw new BadRequestException('Group session is full and waitlist is not enabled');
    }
  }

  private async createBooking(
    clientId: string,
    session: { id: string; price: unknown; currency: string; employeeId: string; serviceId: string; branchId: string; scheduledAt: Date },
    organizationId: string,
  ): Promise<BookGroupSessionResult> {
    const price = Number(session.price);

    const lastBooking = await this.prisma.booking.findFirst({
      where: { organizationId },
      orderBy: { bookingNumber: 'desc' },
      select: { bookingNumber: true },
    });
    const nextBookingNumber = (lastBooking?.bookingNumber ?? 0) + 1;

    const booking = await this.prisma.booking.create({
      data: {
        organizationId,
        branchId: session.branchId,
        clientId,
        employeeId: session.employeeId,
        serviceId: session.serviceId,
        bookingType: 'GROUP',
        status: price > 0 ? BookingStatus.AWAITING_PAYMENT : BookingStatus.CONFIRMED,
        scheduledAt: session.scheduledAt,
        endsAt: new Date(session.scheduledAt.getTime() + 60 * 60 * 1000),
        durationMins: 60,
        price: price,
        currency: session.currency,
        groupSessionId: session.id,
        expiresAt: price > 0 ? new Date(Date.now() + 30 * 60 * 1000) : null,
        bookingNumber: nextBookingNumber,
      },
    });

    await this.prisma.groupEnrollment.create({
      data: {
        organizationId,
        groupSessionId: session.id,
        clientId,
        bookingId: booking.id,
      },
    });

    await this.prisma.groupSession.update({
      where: { id: session.id },
      data: { enrolledCount: { increment: 1 } },
    });

    return {
      type: 'BOOKED',
      bookingId: booking.id,
    };
  }

  private async addToWaitlist(
    clientId: string,
    session: { id: string },
    organizationId: string,
  ): Promise<BookGroupSessionResult> {
    const lastEntry = await this.prisma.groupSessionWaitlist.findFirst({
      where: { groupSessionId: session.id },
      orderBy: { position: 'desc' },
    });

    const position = (lastEntry?.position ?? 0) + 1;

    await this.prisma.groupSessionWaitlist.create({
      data: {
        organizationId,
        groupSessionId: session.id,
        clientId,
        position,
      },
    });

    await this.prisma.groupSession.update({
      where: { id: session.id },
      data: { waitlistCount: { increment: 1 } },
    });

    return {
      type: 'WAITLISTED',
      waitlistPosition: position,
    };
  }
}