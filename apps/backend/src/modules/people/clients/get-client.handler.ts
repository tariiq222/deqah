import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { serializeClient } from './client.serializer';

export interface GetClientQuery {
  clientId: string;
}

@Injectable()
export class GetClientHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(query: GetClientQuery) {
    const organizationId = this.tenant.requireOrganizationId();
    const client = await this.prisma.client.findFirst({
      where: { id: query.clientId, organizationId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Client not found');
    return serializeClient(client);
  }
}
