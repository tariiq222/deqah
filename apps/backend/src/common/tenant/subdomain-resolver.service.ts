import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { extractSubdomain, isReservedSubdomain, DEFAULT_RESERVED_SUBDOMAINS } from './subdomain.utils';
import { SLUG_REGEX } from './slug-generator.util';

interface CacheEntry {
  id: string | null;
  expiresAt: number;
}

const POSITIVE_TTL_MS = 5 * 60_000;
const NEGATIVE_TTL_MS = 60_000;

@Injectable()
export class SubdomainResolverService {
  private readonly logger = new Logger(SubdomainResolverService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly reserved: ReadonlySet<string>;
  private readonly rootDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.rootDomain = config.get<string>('PLATFORM_ROOT_DOMAIN', 'deqah.net');
    const extra = (config.get<string>('RESERVED_SUBDOMAINS', '') || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    this.reserved = new Set([...DEFAULT_RESERVED_SUBDOMAINS, ...extra]);
  }

  /** Returns the organizationId for the given host, or null when unresolved. */
  async resolve(host: string | undefined | null): Promise<string | null> {
    const subdomain = extractSubdomain(host, this.rootDomain);
    if (!subdomain) return null;
    if (isReservedSubdomain(subdomain, this.reserved)) return null;
    if (!SLUG_REGEX.test(subdomain)) return null;

    const cached = this.cache.get(subdomain);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.id;

    const row = await this.prisma.organization.findUnique({
      where: { slug: subdomain },
      select: { id: true },
    });
    const id = row?.id ?? null;
    this.cache.set(subdomain, {
      id,
      expiresAt: now + (id ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
    });
    if (!id) this.logger.debug(`Negative cache: subdomain ${subdomain}`);
    return id;
  }

  /** Drop a single slug from the cache. Call from update-slug handlers. */
  invalidate(slug: string): void {
    this.cache.delete(slug.toLowerCase());
  }
}
