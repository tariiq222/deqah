import { OutboxPublisherCron } from './outbox-publisher.cron';

const buildCls = () => ({
  run: jest.fn().mockImplementation((fn: () => Promise<void>) => fn()),
  set: jest.fn(),
});

describe('OutboxPublisherCron', () => {
  it('publishes pending outbox events and stamps publishedAt', async () => {
    const rows = [
      { id: 'evt-1', eventType: 'bookings.booking.created', payload: { eventId: 'e1', source: 'bookings', version: 1, occurredAt: new Date(), payload: {} } },
      { id: 'evt-2', eventType: 'bookings.booking.created', payload: { eventId: 'e2', source: 'bookings', version: 1, occurredAt: new Date(), payload: {} } },
    ];

    const prisma = {
      $allTenants: {
        outboxEvent: {
          findMany: jest.fn().mockResolvedValue(rows),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      },
    };

    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const cls = buildCls();

    const cron = new OutboxPublisherCron(prisma as never, eventBus as never, cls as never);
    await cron.execute();

    expect(eventBus.publish).toHaveBeenCalledTimes(2);
    expect(eventBus.publish).toHaveBeenCalledWith('bookings.booking.created', rows[0].payload);
    expect(eventBus.publish).toHaveBeenCalledWith('bookings.booking.created', rows[1].payload);

    expect(prisma.$allTenants.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['evt-1', 'evt-2'] } },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('is a no-op when no pending events exist', async () => {
    const prisma = {
      $allTenants: {
        outboxEvent: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
        },
      },
    };
    const eventBus = { publish: jest.fn() };
    const cls = buildCls();

    const cron = new OutboxPublisherCron(prisma as never, eventBus as never, cls as never);
    await cron.execute();

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(prisma.$allTenants.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it('skips a failing event but still stamps the successful ones', async () => {
    const rows = [
      { id: 'evt-fail', eventType: 'bookings.booking.created', payload: { eventId: 'bad' } },
      { id: 'evt-ok', eventType: 'bookings.booking.created', payload: { eventId: 'good' } },
    ];

    const prisma = {
      $allTenants: {
        outboxEvent: {
          findMany: jest.fn().mockResolvedValue(rows),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
    };

    const eventBus = {
      publish: jest.fn()
        .mockRejectedValueOnce(new Error('redis down'))
        .mockResolvedValueOnce(undefined),
    };
    const cls = buildCls();

    const cron = new OutboxPublisherCron(prisma as never, eventBus as never, cls as never);
    await cron.execute();

    // Only the successful event should be stamped
    expect(prisma.$allTenants.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['evt-ok'] } },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('runs inside CLS super-admin context', async () => {
    const prisma = {
      $allTenants: {
        outboxEvent: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
        },
      },
    };
    const eventBus = { publish: jest.fn() };
    const cls = buildCls();

    const cron = new OutboxPublisherCron(prisma as never, eventBus as never, cls as never);
    await cron.execute();

    expect(cls.run).toHaveBeenCalledTimes(1);
    expect(cls.set).toHaveBeenCalledWith(
      expect.any(String), // SUPER_ADMIN_CONTEXT_CLS_KEY
      true,
    );
  });
});
