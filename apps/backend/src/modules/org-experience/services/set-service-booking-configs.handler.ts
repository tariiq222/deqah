import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { SetServiceBookingConfigsDto } from './set-service-booking-configs.dto';

export type SetServiceBookingConfigsCommand = SetServiceBookingConfigsDto & {
  serviceId: string;
};

@Injectable()
export class SetServiceBookingConfigsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: SetServiceBookingConfigsCommand) {
    const organizationId = this.tenant.requireOrganizationId();
    const service = await this.prisma.service.findFirst({
      where: { id: cmd.serviceId, organizationId },
    });
    if (!service) throw new NotFoundException('Service not found');

    // Upsert each booking type config; delete types not included in the payload.
    await this.rlsTx.withTransaction(async (tx) => {
      // Remove configs for types not present in the new payload
      await tx.serviceBookingConfig.deleteMany({
        where: {
          serviceId: cmd.serviceId,
          bookingType: { notIn: cmd.types.map((t) => t.bookingType) },
        },
      });
      // Upsert each config
      await Promise.all(cmd.types.map((t) =>
        tx.serviceBookingConfig.upsert({
          where: {
            serviceId_bookingType: {
              serviceId: cmd.serviceId,
              bookingType: t.bookingType,
            },
          },
          create: {
            id: randomUUID(),
            serviceId: cmd.serviceId,
            organizationId,
            bookingType: t.bookingType,
            price: t.price,
            durationMins: t.durationMins,
            isActive: t.isActive ?? true,
          },
          update: {
            price: t.price,
            durationMins: t.durationMins,
            isActive: t.isActive ?? true,
            updatedAt: new Date(),
          },
        }),
      ));
    });

    return this.prisma.serviceBookingConfig.findMany({
      where: { serviceId: cmd.serviceId },
      orderBy: { bookingType: 'asc' },
    });
  }
}
