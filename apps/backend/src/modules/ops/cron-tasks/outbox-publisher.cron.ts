import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import type { DomainEventEnvelope } from '../../../infrastructure/events/event-bus.service';

/** How many unpublished outbox rows to process per tick. */
const BATCH_SIZE = 50;

/**
 * CR-5: Outbox publisher cron.
 *
 * Runs every 5 seconds (registered in CronTasksService).
 * Selects up to BATCH_SIZE OutboxEvent rows where publishedAt IS NULL,
 * forwards each to EventBusService, then stamps publishedAt = now().
 *
 * At-most-once delivery per tick: if the process crashes between publish and
 * the UPDATE, the row remains unpublished and will be retried on the next
 * tick — giving at-least-once semantics end-to-end.
 *
 * Runs under SUPER_ADMIN_CONTEXT so the $allTenants bypass is active for the
 * OutboxEvent table (platform-level, no organizationId).
 */
@Injectable()
export class OutboxPublisherCron {
  private readonly logger = new Logger(OutboxPublisherCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly cls: ClsService,
  ) {}

  async execute(): Promise<void> {
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      await this.publishPending();
    });
  }

  private async publishPending(): Promise<void> {
    const rows = await this.prisma.$allTenants.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, eventType: true, payload: true },
    });

    if (rows.length === 0) return;

    const publishedIds: string[] = [];

    for (const row of rows) {
      try {
        await this.eventBus.publish(
          row.eventType,
          row.payload as unknown as DomainEventEnvelope,
        );
        publishedIds.push(row.id);
      } catch (err) {
        // Log but continue — failed rows stay unpublished and retry next tick.
        this.logger.error(
          `Failed to publish outbox event ${row.id} (${row.eventType})`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    if (publishedIds.length > 0) {
      await this.prisma.$allTenants.outboxEvent.updateMany({
        where: { id: { in: publishedIds } },
        data: { publishedAt: new Date() },
      });
      this.logger.log(`Outbox: published ${publishedIds.length} events`);
    }
  }
}
