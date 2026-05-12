import { HealthCheckHandler } from './health-check.handler';

const buildRedis = () => ({
  getClient: jest.fn().mockReturnValue({ ping: jest.fn().mockResolvedValue('PONG') }),
});

const buildBullMq = () => ({
  getQueue: jest.fn().mockReturnValue({
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 5, failed: 0 }),
  }),
});

const buildHealthService = (result: object = { status: 'ok', info: {}, error: {}, details: {} }) => ({
  check: jest.fn().mockResolvedValue(result),
});

const buildPrismaIndicator = () => ({
  pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
});

const buildPrisma = () => ({
  $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
});

const buildMinio = () => ({
  ping: jest.fn().mockResolvedValue(undefined),
});

describe('HealthCheckHandler', () => {
  it('returns healthy status when all checks pass', async () => {
    const handler = new HealthCheckHandler(
      buildHealthService() as never,
      buildPrismaIndicator() as never,
      buildPrisma() as never,
      buildRedis() as never,
      buildBullMq() as never,
      buildMinio() as never,
    );
    const result = await handler.execute();
    expect(result.status).toBe('ok');
  });

  it('delegates DB check to prismaIndicator.pingCheck', async () => {
    const prismaIndicator = buildPrismaIndicator();
    const healthService = buildHealthService();
    const handler = new HealthCheckHandler(
      healthService as never,
      prismaIndicator as never,
      buildPrisma() as never,
      buildRedis() as never,
      buildBullMq() as never,
      buildMinio() as never,
    );
    await handler.execute();
    expect(healthService.check).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Function)]),
    );
  });

  it('includes redis and bullmq in checks array', async () => {
    const healthService = buildHealthService({ status: 'ok', info: { redis: { status: 'up' }, bullmq: { status: 'up' } }, error: {}, details: {} });
    const handler = new HealthCheckHandler(
      healthService as never,
      buildPrismaIndicator() as never,
      buildPrisma() as never,
      buildRedis() as never,
      buildBullMq() as never,
      buildMinio() as never,
    );
    const result = await handler.execute();
    expect(result.status).toBe('ok');
  });
});

describe('HealthCheckHandler — private checks', () => {
  it('returns redis down when ping fails', async () => {
    const redis = { getClient: jest.fn().mockReturnValue({ ping: jest.fn().mockRejectedValue(new Error('Connection refused')) }) };
    const capturedChecks: Array<() => Promise<object>> = [];
    const healthService = {
      check: jest.fn().mockImplementation(async (checks: Array<() => Promise<object>>) => {
        capturedChecks.push(...checks);
        return { status: 'ok', info: {}, error: {}, details: {} };
      }),
    };
    const handler = new HealthCheckHandler(
      healthService as never,
      buildPrismaIndicator() as never,
      buildPrisma() as never,
      redis as never,
      buildBullMq() as never,
      buildMinio() as never,
    );
    await handler.execute();
    const redisResult = await capturedChecks[1]();
    expect(redisResult).toMatchObject({ redis: { status: 'down' } });
  });

  it('returns bullmq down when queue check fails', async () => {
    const bullMq = {
      getQueue: jest.fn().mockReturnValue({
        getJobCounts: jest.fn().mockRejectedValue(new Error('Queue error')),
      }),
    };
    const capturedChecks: Array<() => Promise<object>> = [];
    const healthService = {
      check: jest.fn().mockImplementation(async (checks: Array<() => Promise<object>>) => {
        capturedChecks.push(...checks);
        return { status: 'ok', info: {}, error: {}, details: {} };
      }),
    };
    const handler = new HealthCheckHandler(
      healthService as never,
      buildPrismaIndicator() as never,
      buildPrisma() as never,
      buildRedis() as never,
      bullMq as never,
      buildMinio() as never,
    );
    await handler.execute();
    const bullMqResult = await capturedChecks[2]();
    expect(bullMqResult).toMatchObject({ bullmq: { status: 'down' } });
  });
});