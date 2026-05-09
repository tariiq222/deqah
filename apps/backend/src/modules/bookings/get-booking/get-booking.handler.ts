import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { mapBookingRow, type BookingRelations } from '../booking-row.mapper';

export interface GetBookingQuery {
  bookingId: string;
}

@Injectable()
export class GetBookingHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetBookingQuery) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: query.bookingId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${query.bookingId} not found`);
    }

    const [client, employee, service] = await Promise.all([
      this.prisma.client.findFirst({ where: { id: booking.clientId } }),
      this.prisma.employee.findFirst({ where: { id: booking.employeeId } }),
      this.prisma.service.findFirst({ where: { id: booking.serviceId } }),
    ]);

    const relations: BookingRelations = {
      clientsById: new Map(client ? [[client.id, client]] : []),
      employeesById: new Map(employee ? [[employee.id, employee]] : []),
      servicesById: new Map(service ? [[service.id, service]] : []),
    };

    return mapBookingRow(booking, relations);
  }
}
