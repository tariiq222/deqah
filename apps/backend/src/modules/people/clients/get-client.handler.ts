import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { serializeClient } from './client.serializer';

export interface GetClientQuery {
  clientId: string;
}

@Injectable()
export class GetClientHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetClientQuery) {
    const client = await this.prisma.client.findFirst({
      where: { id: query.clientId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Client not found');
    return serializeClient(client);
  }
}
