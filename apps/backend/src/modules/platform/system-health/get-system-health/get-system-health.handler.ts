import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RedisService } from '../../../../infrastructure/cache/redis.service';
import { BullMqService } from '../../../../infrastructure/queue/bull-mq.service';
import { MinioService } from '../../../../infrastructure/storage/minio.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

export interface SubsystemHealth {
  name: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  detail?: string;
}

export interface SystemHealthResult {
  overall: 'ok' | 'degraded' | 'down';
  subsystems: SubsystemHealth[];
  checkedAt: string;
}

const PROBE_TIMEOUT_MS = 5000;

@Injectable()
export class GetSystemHealthHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly bullmq: BullMqService,
    private readonly minio: MinioService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async execute(): Promise<SystemHealthResult> {
    const subsystems: SubsystemHealth[] = await Promise.all([
      this.probe('postgres', () => this.probePostgres()),
      this.probe('redis', () => this.probeRedis()),
      this.probe('bullmq', () => this.probeBullMq()),
      this.probe('minio', () => this.probeMinio()),
      this.probe('moyasar', () => this.probeMoyasar()),
      this.probe('resend', () => this.probeResend()),
    ]);

    const downCount = subsystems.filter((s) => s.status === 'down').length;
    const degradedCount = subsystems.filter((s) => s.status === 'degraded').length;
    const overall = downCount > 0 ? 'down' : degradedCount > 0 ? 'degraded' : 'ok';

    return { overall, subsystems, checkedAt: new Date().toISOString() };
  }

  private async probe(
    name: string,
    fn: () => Promise<{ status: 'ok' | 'degraded'; detail?: string }>,
  ): Promise<SubsystemHealth> {
    const start = Date.now();
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`probe_timeout_${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS),
        ),
      ]);
      return { name, ...result, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        name,
        status: 'down',
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async probePostgres(): Promise<{ status: 'ok' | 'degraded'; detail?: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }

  private async probeRedis(): Promise<{ status: 'ok' | 'degraded'; detail?: string }> {
    const pong = await this.redis.getClient().ping();
    if (pong === 'PONG') return { status: 'ok' };
    return { status: 'degraded', detail: `unexpected ping response: ${pong}` };
  }

  private async probeBullMq(): Promise<{ status: 'ok' | 'degraded'; detail?: string }> {
    // Probe one well-known queue (platform-mail is created on app boot by MailModule).
    // getQueue creates it on demand if not already cached — the probe still
    // validates the underlying ioredis-for-bullmq connection.
    const queue = this.bullmq.getQueue('platform-mail');
    // bullmq Queue exposes .client (ioredis Promise). Awaiting it confirms the
    // connection is open; a ping confirms round-trip latency.
    const client = await queue.client;
    const pong = await client.ping();
    if (pong === 'PONG') return { status: 'ok' };
    return { status: 'degraded', detail: `bullmq ping: ${pong}` };
  }

  private async probeMinio(): Promise<{ status: 'ok' | 'degraded'; detail?: string }> {
    const bucket = process.env.MINIO_BUCKET ?? 'deqah';
    const exists = await this.minio.bucketExists(bucket);
    if (exists) return { status: 'ok' };
    return { status: 'degraded', detail: `bucket ${bucket} missing` };
  }

  private async probeMoyasar(): Promise<{ status: 'ok' | 'degraded'; detail?: string }> {
    const secret = await this.platformSettings.get<string>(
      'billing.moyasar.platformSecretKey',
      'MOYASAR_PLATFORM_SECRET_KEY',
    );
    if (!secret) {
      return { status: 'degraded', detail: 'no platform secret key configured' };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.moyasar.com/v1/payments?per_page=1', {
        headers: { Authorization: `Basic ${Buffer.from(secret + ':').toString('base64')}` },
        signal: ctrl.signal,
      });
      if (res.status === 401) return { status: 'degraded', detail: 'invalid key' };
      if (res.status >= 500) return { status: 'degraded', detail: `moyasar ${res.status}` };
      return { status: 'ok' };
    } finally {
      clearTimeout(t);
    }
  }

  private async probeResend(): Promise<{ status: 'ok' | 'degraded'; detail?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { status: 'degraded', detail: 'RESEND_API_KEY not set' };
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.resend.com/api-keys', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctrl.signal,
      });
      if (res.status === 401) return { status: 'degraded', detail: 'invalid key' };
      if (res.status >= 500) return { status: 'degraded', detail: `resend ${res.status}` };
      return { status: 'ok' };
    } finally {
      clearTimeout(t);
    }
  }
}
