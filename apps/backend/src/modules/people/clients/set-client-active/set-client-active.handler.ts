import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { EventBusService } from '../../../../infrastructure/events';
import { LogActivityHandler } from '../../../ops/log-activity/log-activity.handler';
import { ClientAccountToggledEvent } from '../../events/client-account-toggled.event';
import { SetClientActiveDto } from './set-client-active.dto';

export interface SetClientActiveCommand extends SetClientActiveDto {
  clientId: string;
  actorUserId?: string;
}

export interface SetClientActiveResult {
  id: string;
  isActive: boolean;
}

@Injectable()
export class SetClientActiveHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly logActivity: LogActivityHandler,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: SetClientActiveCommand): Promise<SetClientActiveResult> {
    const client = await this.prisma.client.findFirst({
      where: { id: cmd.clientId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Client not found');

    // No-op: already in the desired state — return immediately without
    // re-revoking tokens, re-emitting events, or writing a duplicate log entry.
    if (client.isActive === cmd.isActive) {
      return { id: client.id, isActive: client.isActive };
    }

    const now = new Date();

    const updated = await this.rlsTx.withTransaction(async (tx) => {
      const updatedClient = await tx.client.update({
        where: { id: cmd.clientId },
        data: { isActive: cmd.isActive },
        select: { id: true, isActive: true },
      });

      if (!cmd.isActive) {
        await tx.clientRefreshToken.updateMany({
          where: { clientId: cmd.clientId, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      return updatedClient;
    });

    const event = new ClientAccountToggledEvent({
      clientId: updated.id,
      isActive: updated.isActive,
      reason: cmd.reason,
      actorUserId: cmd.actorUserId,
    });
    await this.eventBus.publish(event.eventName, event.toEnvelope());

    await this.logActivity.execute({
      userId: cmd.actorUserId,
      action: ActivityAction.UPDATE,
      entity: 'Client',
      entityId: cmd.clientId,
      description: cmd.isActive
        ? `Client account enabled`
        : `Client account disabled`,
      metadata: {
        isActive: cmd.isActive,
        ...(cmd.reason ? { reason: cmd.reason } : {}),
      },
    });

    return { id: updated.id, isActive: updated.isActive };
  }
}
