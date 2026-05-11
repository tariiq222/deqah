import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { SubdomainResolverService } from './subdomain-resolver.service';

describe('SubdomainResolverService', () => {
  let svc: SubdomainResolverService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let redisClient: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };
  let redis: { getClient: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    redisClient = { get: jest.fn().mockResolvedValue(null), setex: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
    redis = { getClient: jest.fn().mockReturnValue(redisClient) };
    const config = { get: (k: string, d?: string) => (k === 'PLATFORM_ROOT_DOMAIN' ? 'deqah.net' : d) };
    const mod = await Test.createTestingModule({
      providers: [
        SubdomainResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    svc = mod.get(SubdomainResolverService);
  });

  it('returns null for plain root host', async () => {
    expect(await svc.resolve('deqah.net')).toBeNull();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns null for IPs', async () => {
    expect(await svc.resolve('178.105.84.5')).toBeNull();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('returns null for reserved subdomain (no DB hit)', async () => {
    expect(await svc.resolve('admin.deqah.net')).toBeNull();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('looks up DB for valid subdomain and caches the result', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    const a = await svc.resolve('sawa.deqah.net');
    const b = await svc.resolve('sawa.deqah.net');
    expect(a).toBe('org-1');
    expect(b).toBe('org-1');
    // Second call hits L1 — DB called only once
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it('caches negative lookups for unknown subdomains', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce(null);
    expect(await svc.resolve('ghost.deqah.net')).toBeNull();
    expect(await svc.resolve('ghost.deqah.net')).toBeNull();
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it('invalidate clears a slug entry', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    await svc.resolve('sawa.deqah.net');
    await svc.invalidate('sawa');
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    await svc.resolve('sawa.deqah.net');
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
  });

  it('invalidate calls Redis DEL and clears L1 so next resolve hits DB again', async () => {
    // Populate L1 via a DB lookup
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    await svc.resolve('sawa.deqah.net');
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);

    // Invalidate — should clear L1 and call Redis DEL
    await svc.invalidate('sawa');
    expect(redisClient.del).toHaveBeenCalledWith('subres:slug:sawa');

    // Next resolve should miss L1 (cleared) and L2 (Redis mock still returns null)
    // so it goes to DB again
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-new' });
    const result = await svc.resolve('sawa.deqah.net');
    expect(result).toBe('org-new');
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
  });

  it('L2 Redis hit returns cached id without hitting DB', async () => {
    // Redis returns a cached positive entry
    redisClient.get.mockResolvedValueOnce(JSON.stringify({ id: 'org-redis' }));

    const result = await svc.resolve('sawa.deqah.net');

    expect(result).toBe('org-redis');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('writes to Redis SETEX after a DB lookup with positive TTL', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    await svc.resolve('sawa.deqah.net');

    expect(redisClient.setex).toHaveBeenCalledWith(
      'subres:slug:sawa',
      300, // POSITIVE_TTL_S
      JSON.stringify({ id: 'org-1' }),
    );
  });

  it('writes to Redis SETEX with negative TTL for unknown slugs', async () => {
    prisma.organization.findUnique.mockResolvedValueOnce(null);
    await svc.resolve('ghost.deqah.net');

    expect(redisClient.setex).toHaveBeenCalledWith(
      'subres:slug:ghost',
      60, // NEGATIVE_TTL_S
      JSON.stringify({ id: null }),
    );
  });
});
