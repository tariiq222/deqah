import { TokenService } from './token.service';

const mockUser = {
  id: 'user-1', email: 'admin@clinic.sa',
  role: 'ADMIN', customRoleId: null, customRole: null, tokenVersion: 0,
};

const tenantClaims = {
  organizationId: 'org-1',
  membershipId: 'mem-1',
};

const buildJwt = () => ({
  sign: jest.fn().mockReturnValue('signed.access.token'),
});

const buildConfig = (overrides: Record<string, string> = {}) => ({
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, string> = {
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      ...overrides,
    };
    return map[key];
  }),
  get: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, string> = { JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '30d', ...overrides };
    return map[key];
  }),
});

const buildPrisma = () => ({
  refreshToken: {
    create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
    findFirst: jest.fn().mockResolvedValue({ id: 'rt-1', tokenHash: '$bcrypt', expiresAt: new Date(Date.now() + 86400_000), revoked: false }),
    update: jest.fn().mockResolvedValue({ id: 'rt-1', revoked: true }),
  },
});

describe('TokenService.issueTokenPair', () => {
  it('returns accessToken and refreshToken', async () => {
    const jwt = buildJwt();
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    const result = await service.issueTokenPair(mockUser, tenantClaims);

    expect(result.accessToken).toBe('signed.access.token');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.refreshToken.length).toBeGreaterThan(10);
  });

  it('signs JWT with ACCESS secret', async () => {
    const jwt = buildJwt();
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    await service.issueTokenPair(mockUser, tenantClaims);

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', email: 'admin@clinic.sa' }),
      expect.objectContaining({ secret: 'access-secret' }),
    );
  });

  it('stores hashed refresh token in DB with organizationId', async () => {
    const prisma = buildPrisma();
    const service = new TokenService(buildJwt() as never, buildConfig() as never, prisma as never);
    await service.issueTokenPair(mockUser, tenantClaims);

    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('signs JWT with organizationId + membershipId + isSuperAdmin claims', async () => {
    const jwt = buildJwt();
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    await service.issueTokenPair(mockUser, {
      organizationId: 'org-1',
      membershipId: 'mem-1',
      isSuperAdmin: true,
    });

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        membershipId: 'mem-1',
        isSuperAdmin: true,
      }),
      expect.anything(),
    );
  });

  it('defaults isSuperAdmin to false when tenantClaims omits it', async () => {
    const jwt = buildJwt();
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    await service.issueTokenPair(mockUser, { organizationId: 'org-1' });

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ isSuperAdmin: false }),
      expect.anything(),
    );
  });

  it('should include membershipRole in JWT payload when membership is provided', async () => {
    const jwt = buildJwt();
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    await service.issueTokenPair(
      { id: 'u1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null, tokenVersion: 0 },
      { organizationId: 'org1', membershipId: 'm1', membershipRole: 'ADMIN' },
    );
    const payload = jwt.sign.mock.calls[0][0] as { membershipRole?: string };
    expect(payload.membershipRole).toBe('ADMIN');
  });

  it('membershipRole is undefined in JWT when not provided in tenantClaims', async () => {
    const jwt = buildJwt();
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    await service.issueTokenPair(mockUser, { organizationId: 'org-1' });
    const payload = jwt.sign.mock.calls[0][0] as { membershipRole?: string };
    expect(payload.membershipRole).toBeUndefined();
  });

  it('JWT payload permissions defaults to [] for users with no customRole', async () => {
    const jwt = buildJwt();
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    await service.issueTokenPair({ ...mockUser, customRole: null }, tenantClaims);

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: [] }),
      expect.anything(),
    );
  });

  it('includes customRole permissions in JWT payload', async () => {
    const jwt = buildJwt();
    const userWithRole = { ...mockUser, customRoleId: 'role-1', customRole: { permissions: [{ action: 'read', subject: 'Booking' }] } };
    const service = new TokenService(jwt as never, buildConfig() as never, buildPrisma() as never);
    await service.issueTokenPair(userWithRole, tenantClaims);

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: [{ action: 'read', subject: 'Booking' }] }),
      expect.anything(),
    );
  });
});
