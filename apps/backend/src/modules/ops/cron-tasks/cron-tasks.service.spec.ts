import { CronTasksService, CRON_JOBS } from './cron-tasks.service';

const buildCronMock = () => ({ execute: jest.fn().mockResolvedValue(undefined) });

const buildBullMq = () => {
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const worker = { on: jest.fn() };
  let workerProcessor: ((job: { name: string }) => Promise<void>) | null = null;
  return {
    getQueue: jest.fn().mockReturnValue(queue),
    createWorker: jest.fn((_, processor) => {
      workerProcessor = processor as typeof workerProcessor;
      return worker;
    }),
    queue,
    worker,
    getProcessor: () => workerProcessor!,
  };
};

type CronDeps = [
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never,
  never, // reconcileUsageCounters (Phase 5 / Task 11)
  never, // reconcileRefunds (CR-6)
  never, // outboxPublisher
];

/** Build cron mocks (all crons except BullMqService itself). */
const buildAllMocks = () => [
  buildCronMock(), // bookingAutocomplete       [0]
  buildCronMock(), // bookingExpiry             [1]
  buildCronMock(), // bookingNoShow             [2]
  buildCronMock(), // appointmentReminders      [3]
  buildCronMock(), // groupSessionAutomation    [4]
  buildCronMock(), // refreshTokenCleanup       [5]
  buildCronMock(), // meterUsage                [6]
  buildCronMock(), // chargeDueSubscriptions    [7]
  buildCronMock(), // computeOverage            [8]
  buildCronMock(), // enforceGracePeriod        [9]
  buildCronMock(), // expireImpersonationSessions [10]
  buildCronMock(), // expireTrials              [11]
  buildCronMock(), // usageWarnings             [12]
  buildCronMock(), // processScheduledPlanChanges [13]
  buildCronMock(), // dunningRetry              [14]
  buildCronMock(), // dbRowCount (DB-12)        [15]
  buildCronMock(), // orphanAudit (DB-13)       [16]
  buildCronMock(), // reconcileUsageCounters    [17]
  buildCronMock(), // reconcileRefunds (CR-6)   [18]
  buildCronMock(), // outboxPublisher           [19]
] as const;

const buildService = (bullMq: ReturnType<typeof buildBullMq>, mocks: ReturnType<typeof buildAllMocks>) =>
  new CronTasksService(bullMq as never, ...(mocks.map((m) => m as never) as CronDeps));

describe('CronTasksService', () => {
  it('schedules all cron jobs on module init', () => {
    const bullMq = buildBullMq();
    const mocks = buildAllMocks();
    const service = buildService(bullMq, mocks);
    service.onModuleInit();

    expect(bullMq.queue.add).toHaveBeenCalledTimes(Object.keys(CRON_JOBS).length);
    Object.values(CRON_JOBS).forEach((name) => {
      expect(bullMq.queue.add).toHaveBeenCalledWith(name, {}, expect.objectContaining({ repeat: expect.anything() }));
    });
    expect(bullMq.queue.add).toHaveBeenCalledWith(
      CRON_JOBS.USAGE_WARNINGS,
      {},
      expect.objectContaining({ repeat: { pattern: '0 9 * * *' } }),
    );
    expect(bullMq.queue.add).toHaveBeenCalledWith(
      CRON_JOBS.PROCESS_SCHEDULED_PLAN_CHANGES,
      {},
      expect.objectContaining({ repeat: { pattern: '0 2 * * *' } }),
    );
    expect(bullMq.queue.add).toHaveBeenCalledWith(
      CRON_JOBS.DUNNING_RETRY,
      {},
      expect.objectContaining({ repeat: { pattern: '0 * * * *' } }),
    );
    expect(bullMq.queue.add).toHaveBeenCalledWith(
      CRON_JOBS.RECONCILE_USAGE_COUNTERS,
      {},
      expect.objectContaining({ repeat: { pattern: '0 3 * * *' } }),
    );
  });

  it('registers a worker on the ops-cron queue', () => {
    const bullMq = buildBullMq();
    const mocks = buildAllMocks();
    const service = buildService(bullMq, mocks);
    service.onModuleInit();
    expect(bullMq.createWorker).toHaveBeenCalledWith('ops-cron', expect.any(Function));
    expect(bullMq.worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  // Worker routing — maps each schedulable job to its handler mock index
  const ROUTED_JOBS: Array<[string, number]> = [
    [CRON_JOBS.BOOKING_AUTOCOMPLETE, 0],
    [CRON_JOBS.BOOKING_EXPIRY, 1],
    [CRON_JOBS.BOOKING_NOSHOW, 2],
    [CRON_JOBS.APPOINTMENT_REMINDERS, 3],
    [CRON_JOBS.GROUP_SESSION_AUTOMATION, 4],
    [CRON_JOBS.REFRESH_TOKEN_CLEANUP, 5],
    [CRON_JOBS.METER_USAGE, 6],
    [CRON_JOBS.CHARGE_DUE_SUBSCRIPTIONS, 7],
    [CRON_JOBS.ENFORCE_GRACE_PERIOD, 9],
    [CRON_JOBS.EXPIRE_IMPERSONATION_SESSIONS, 10],
    [CRON_JOBS.EXPIRE_TRIALS, 11],
    [CRON_JOBS.USAGE_WARNINGS, 12],
    [CRON_JOBS.PROCESS_SCHEDULED_PLAN_CHANGES, 13],
    [CRON_JOBS.DUNNING_RETRY, 14],
    [CRON_JOBS.DB_ROW_COUNT, 15],
    [CRON_JOBS.ORPHAN_AUDIT, 16],
    [CRON_JOBS.RECONCILE_USAGE_COUNTERS, 17],
    [CRON_JOBS.RECONCILE_REFUNDS, 18],
  ];

  it.each(ROUTED_JOBS)('worker routes %s job to correct cron handler', async (jobName, idx) => {
    const bullMq = buildBullMq();
    const mocks = buildAllMocks();
    const service = buildService(bullMq, mocks);
    service.onModuleInit();

    const processor = bullMq.getProcessor();
    await processor({ name: jobName });

    expect(mocks[idx].execute).toHaveBeenCalledTimes(1);
  });
});
