import { CheckTenantExistsHandler } from './check-tenant-exists.handler';
import { SubdomainResolverService } from '../../../../common/tenant/subdomain-resolver.service';

describe('CheckTenantExistsHandler', () => {
  const subdomainResolver = {
    resolve: jest.fn(),
  } as unknown as SubdomainResolverService;

  const handler = new CheckTenantExistsHandler(subdomainResolver);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns exists=true with organizationId when subdomain resolves', async () => {
    (subdomainResolver.resolve as jest.Mock).mockResolvedValue('org-123');

    const result = await handler.execute('sawa.deqah.net');

    expect(subdomainResolver.resolve).toHaveBeenCalledWith('sawa.deqah.net');
    expect(result).toEqual({ exists: true, organizationId: 'org-123' });
  });

  it('returns exists=false when resolver returns null (reserved/invalid/missing)', async () => {
    (subdomainResolver.resolve as jest.Mock).mockResolvedValue(null);

    const result = await handler.execute('api.deqah.net');

    expect(result).toEqual({ exists: false });
  });

  it('returns exists=false when host is undefined', async () => {
    (subdomainResolver.resolve as jest.Mock).mockResolvedValue(null);

    const result = await handler.execute(undefined);

    expect(subdomainResolver.resolve).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({ exists: false });
  });
});
