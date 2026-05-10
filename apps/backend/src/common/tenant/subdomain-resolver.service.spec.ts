import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SubdomainResolverService } from './subdomain-resolver.service';

describe('SubdomainResolverService', () => {
  let svc: SubdomainResolverService;
  let prisma: { organization: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    const config = { get: (k: string, d?: string) => (k === 'PLATFORM_ROOT_DOMAIN' ? 'deqah.net' : d) };
    const mod = await Test.createTestingModule({
      providers: [
        SubdomainResolverService,
        { provide: PrismaService, useValue: prisma },
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
    svc.invalidate('sawa');
    prisma.organization.findUnique.mockResolvedValueOnce({ id: 'org-1' });
    await svc.resolve('sawa.deqah.net');
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
  });
});
