import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/cache/redis.service';
import {
  extractSubdomain,
  isReservedSubdomain,
  DEFAULT_RESERVED_SUBDOMAINS,
} from './subdomain.utils';

export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

interface CacheEntry {
  id: string | null;
  expiresAt: number;
}

/** L1 in-process TTL — keeps hot slugs off Redis for 5 seconds */
const L1_TTL_MS = 5_000;

/** Redis L2 TTL for positive lookups (org found) — 5 minutes */
const POSITIVE_TTL_MS = 5 * 60_000;
/** Redis L2 TTL for negative lookups (org not found) — 1 minute */
const NEGATIVE_TTL_MS = 60_000;

/** Redis L2 TTL in seconds for SETEX */
const POSITIVE_TTL_S = Math.floor(POSITIVE_TTL_MS / 1000);
const NEGATIVE_TTL_S = Math.floor(NEGATIVE_TTL_MS / 1000);

@Injectable()
export class SubdomainResolverService {
  private readonly logger = new Logger(SubdomainResolverService.name);
  private readonly l1 = new Map<string, CacheEntry>();
  private readonly reserved: ReadonlySet<string>;
  private readonly rootDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.rootDomain = config.get<string>('PLATFORM_ROOT_DOMAIN', 'deqah.net');
    const extra = (config.get<string>('RESERVED_SUBDOMAINS', '') || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    this.reserved = new Set([...DEFAULT_RESERVED_SUBDOMAINS, ...extra]);
  }

  /**
   * Returns the organizationId for the given host, or null when unresolved.
   *
   * Lookup order:
   *   1. L1 in-process Map (5 s TTL) — avoids Redis round-trip on hot paths
   *   2. Redis L2 (GET subres:slug:<slug>) — shared across pods
   *   3. Prisma DB — source of truth; result is written to both L2 and L1
   *
   * Organization is not a tenant-scoped model, so plain prisma.organization is fine.
   */
  async resolve(host: string | undefined | null): Promise<string | null> {
    const subdomain = extractSubdomain(host, this.rootDomain);
    if (!subdomain) return null;
    if (isReservedSubdomain(subdomain, this.reserved)) return null;
    if (!SLUG_REGEX.test(subdomain)) return null;

    const now = Date.now();

    // ── L1: in-process Map ──────────────────────────────────────────────────
    const l1Entry = this.l1.get(subdomain);
    if (l1Entry && l1Entry.expiresAt > now) return l1Entry.id;

    // ── L2: Redis ───────────────────────────────────────────────────────────
    const redisKey = `subres:slug:${subdomain}`;
    try {
      const raw = await this.redis.getClient().get(redisKey);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { id: string | null };
        // Populate L1 from Redis hit
        this.l1.set(subdomain, { id: parsed.id, expiresAt: now + L1_TTL_MS });
        return parsed.id;
      }
    } catch (err) {
      // Redis failure is non-fatal — fall through to DB
      this.logger.warn(`Redis GET failed for ${redisKey}`, err instanceof Error ? err.message : String(err));
    }

    // ── DB: source of truth ─────────────────────────────────────────────────
    const row = await this.prisma.organization.findUnique({
      where: { slug: subdomain },
      select: { id: true },
    });
    const id = row?.id ?? null;

    const redisTtlS = id ? POSITIVE_TTL_S : NEGATIVE_TTL_S;
    try {
      await this.redis.getClient().setex(redisKey, redisTtlS, JSON.stringify({ id }));
    } catch (err) {
      this.logger.warn(`Redis SETEX failed for ${redisKey}`, err instanceof Error ? err.message : String(err));
    }

    this.l1.set(subdomain, { id, expiresAt: now + L1_TTL_MS });

    if (!id) this.logger.debug(`Negative cache: subdomain ${subdomain}`);
    return id;
  }

  /**
   * Drop a slug from both L1 and Redis L2.
   * Call from update-slug handlers to invalidate across all pods.
   */
  async invalidate(slug: string): Promise<void> {
    const key = slug.toLowerCase();
    this.l1.delete(key);
    try {
      await this.redis.getClient().del(`subres:slug:${key}`);
    } catch (err) {
      this.logger.warn(`Redis DEL failed for subres:slug:${key}`, err instanceof Error ? err.message : String(err));
    }
  }
}
