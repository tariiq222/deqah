import { Injectable } from '@nestjs/common';
import { WaitlistStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { ListWaitlistDto } from './list-waitlist.dto';

export type ListWaitlistQuery = ListWaitlistDto;

@Injectable()
export class ListWaitlistHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWaitlistQuery) {
    return this.prisma.waitlistEntry.findMany({
      where: {
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { status: query.status as WaitlistStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
