import { Test } from '@nestjs/testing';
import { GetSystemHealthHandler } from './get-system-health.handler';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RedisService } from '../../../../infrastructure/cache/redis.service';
import { BullMqService } from '../../../../infrastructure/queue/bull-mq.service';
import { MinioService } from '../../../../infrastructure/storage/minio.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

describe('GetSystemHealthHandler', () => {
  let handler: GetSystemHealthHandler;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { getClient: jest.Mock };
  let redisClient: { ping: jest.Mock };
  let bullmq: { getQueue: jest.Mock };
  let bullmqClient: { ping: jest.Mock };
  let bullmqQueue: { client: Promise<typeof bullmqClient> };
  let minio: { bucketExists: jest.Mock };
  let settings: { get: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    redisClient = { ping: jest.fn().mockResolvedValue('PONG') };
    redis = { getClient: jest.fn().mockReturnValue(redisClient) };
    bullmqClient = { ping: jest.fn().mockResolvedValue('PONG') };
    bullmqQueue = { client: Promise.resolve(bullmqClient) };
    bullmq = { getQueue: jest.fn().mockReturnValue(bullmqQueue) };
    minio = { bucketExists: jest.fn().mockResolvedValue(true) };
    settings = { get: jest.fn().mockResolvedValue('sk_test_xxx') };

    // Mock global fetch for moyasar/resend probes
    global.fetch = jest.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    process.env.RESEND_API_KEY = 're_xxx';
    process.env.MINIO_BUCKET = 'test-bucket';

    const module = await Test.createTestingModule({
      providers: [
        GetSystemHealthHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: BullMqService, useValue: bullmq },
        { provide: MinioService, useValue: minio },
        { provide: PlatformSettingsService, useValue: settings },
      ],
    }).compile();
    handler = module.get(GetSystemHealthHandler);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.MINIO_BUCKET;
  });

  it('returns overall=ok when every subsystem is healthy', async () => {
    const result = await handler.execute();
    expect(result.overall).toBe('ok');
    expect(result.subsystems).toHaveLength(6);
    expect(result.subsystems.map((s) => s.name).sort()).toEqual(
      ['bullmq', 'minio', 'moyasar', 'postgres', 'redis', 'resend'],
    );
    expect(result.subsystems.every((s) => s.status === 'ok')).toBe(true);
  });

  it('marks postgres down when $queryRaw rejects', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const result = await handler.execute();
    const pg = result.subsystems.find((s) => s.name === 'postgres')!;
    expect(pg.status).toBe('down');
    expect(pg.detail).toContain('connection refused');
    expect(result.overall).toBe('down');
  });

  it('marks redis down when ping rejects', async () => {
    redisClient.ping.mockRejectedValue(new Error('redis offline'));
    const result = await handler.execute();
    expect(result.subsystems.find((s) => s.name === 'redis')!.status).toBe('down');
  });

  it('marks redis degraded when ping returns unexpected value', async () => {
    redisClient.ping.mockResolvedValue('NOT_PONG');
    const result = await handler.execute();
    const r = result.subsystems.find((s) => s.name === 'redis')!;
    expect(r.status).toBe('degraded');
    expect(r.detail).toContain('unexpected ping');
  });

  it('marks bullmq ok via underlying ioredis ping', async () => {
    const result = await handler.execute();
    expect(bullmq.getQueue).toHaveBeenCalledWith('platform-mail');
    expect(bullmqClient.ping).toHaveBeenCalled();
    expect(result.subsystems.find((s) => s.name === 'bullmq')!.status).toBe('ok');
  });

  it('marks bullmq down when ping throws', async () => {
    bullmqClient.ping.mockRejectedValue(new Error('bullmq dead'));
    const result = await handler.execute();
    expect(result.subsystems.find((s) => s.name === 'bullmq')!.status).toBe('down');
  });

  it('marks minio degraded when bucket does not exist', async () => {
    minio.bucketExists.mockResolvedValue(false);
    const result = await handler.execute();
    const m = result.subsystems.find((s) => s.name === 'minio')!;
    expect(m.status).toBe('degraded');
    expect(m.detail).toContain('missing');
  });

  it('marks moyasar degraded when no secret key is configured', async () => {
    settings.get.mockResolvedValue(null);
    const result = await handler.execute();
    expect(result.subsystems.find((s) => s.name === 'moyasar')!.status).toBe('degraded');
  });

  it('marks moyasar degraded on 401', async () => {
    // resend calls fetch synchronously (no async pre-check); moyasar calls fetch
    // only after awaiting platformSettings.get(), so resend consumes the first mock.
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 200 }); // resend
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 401 }); // moyasar
    const result = await handler.execute();
    expect(result.subsystems.find((s) => s.name === 'moyasar')!.status).toBe('degraded');
  });

  it('marks resend degraded when env not set', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await handler.execute();
    expect(result.subsystems.find((s) => s.name === 'resend')!.status).toBe('degraded');
  });

  it('records latencyMs for every subsystem', async () => {
    const result = await handler.execute();
    expect(result.subsystems.every((s) => typeof s.latencyMs === 'number' && s.latencyMs >= 0)).toBe(true);
  });

  it('overall = degraded when at least one subsystem is degraded but none is down', async () => {
    delete process.env.RESEND_API_KEY; // resend → degraded
    const result = await handler.execute();
    expect(result.overall).toBe('degraded');
  });
});
