import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue, Worker } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { BullMqService } from '../queue/bull-mq.service';
import { SUPER_ADMIN_CONTEXT_CLS_KEY, TENANT_CLS_KEY } from '../../common/tenant/tenant.constants';

/**
 * Minimal envelope every domain event must produce. The full `BaseEvent`
 * class lives in `common/events/` (task p1-t9) — this type is just the
 * transport shape the bus needs to route. Keeping the definition local
 * avoids a circular dependency with `common/` during Phase 1.
 */
export interface DomainEventEnvelope<TPayload = unknown> {
  eventId: string;
  correlationId?: string;
  source: string;
  version: number;
  occurredAt: Date | string;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (
  event: DomainEventEnvelope<TPayload>,
) => Promise<void> | void;

const EVENT_QUEUE_NAME = 'domain-events';

/**
 * Inter-context event bus built on a single BullMQ queue.
 *
 * Publishers call {@link publish} with an event name and envelope; BullMQ
 * persists the job in Redis and a worker dispatches it to every handler
 * registered for that name via {@link subscribe}. This replaces direct
 * imports between Bounded Contexts with asynchronous message passing, so
 * `bookings` can react to `payment.completed` without importing `finance`.
 *
 * Only one worker is started per process (lazy, on first `subscribe`).
 * Handlers run sequentially inside the worker — callers that need
 * concurrency should fan out inside their handler.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly handlers = new Map<string, EventHandler[]>();
  private worker?: Worker;

  constructor(
    private readonly bullmq: BullMqService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Publish a domain event. The job name is the event name so subscribers
   * can dispatch without inspecting the payload.
   */
  async publish<TPayload>(
    eventName: string,
    event: DomainEventEnvelope<TPayload>,
  ): Promise<void> {
    const queue = this.getQueue();
    await queue.add(eventName, event, {
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });
  }

  /**
   * Register a handler for an event name. The first call also boots the
   * worker that drains the queue — we defer worker creation so test suites
   * and modules that only publish don't open a Redis connection.
   */
  subscribe<TPayload>(eventName: string, handler: EventHandler<TPayload>): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as EventHandler);
    this.handlers.set(eventName, list);
    this.ensureWorker();
    this.logger.log(`Handler registered for event "${eventName}"`);
  }

  private getQueue(): Queue {
    return this.bullmq.getQueue(EVENT_QUEUE_NAME);
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = this.bullmq.createWorker(EVENT_QUEUE_NAME, async (job: Job) => {
      await this.dispatch(job.name, job.data as DomainEventEnvelope);
    });
  }

  /**
   * Run every handler registered for `eventName` sequentially inside a CLS
   * context. If the event payload carries an `organizationId` the handlers
   * run with a tenant CLS context so scoped Prisma queries work correctly.
   * Platform-level events (no tenant) run under the super-admin context so
   * `$allTenants` queries succeed without throwing. Handlers in that path
   * must not write tenant-scoped rows.
   *
   * A failing handler throws, which causes BullMQ to retry the job per its
   * policy — at-least-once delivery is the contract.
   */
  private async dispatch(
    eventName: string,
    event: DomainEventEnvelope,
  ): Promise<void> {
    const list = this.handlers.get(eventName);
    if (!list || list.length === 0) return;

    const organizationId = (event.payload as Record<string, unknown>)?.organizationId as string | undefined;

    await this.cls.run(async () => {
      if (organizationId) {
        // Tenant-scoped event: set CLS so scoped Prisma queries work inside handlers
        this.cls.set(TENANT_CLS_KEY, {
          organizationId,
          membershipId: '',
          id: '',
          role: '',
          isSuperAdmin: false,
        });
      } else {
        // Platform-level event (no tenant): run in super-admin context so
        // $allTenants queries work without throwing. Handlers must not write
        // tenant-scoped rows.
        this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      }

      for (const handler of list) {
        await handler(event);
      }
    });
  }
}
