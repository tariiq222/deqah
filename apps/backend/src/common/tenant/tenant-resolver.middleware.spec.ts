import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { ConfigModule } from '@nestjs/config';
import { TenantContextService } from './tenant-context.service';
import { TenantResolverMiddleware } from './tenant-resolver.middleware';
import { SubdomainResolverService } from './subdomain-resolver.service';
import { TenantResolutionError } from './tenant.errors';
import { DEFAULT_ORGANIZATION_ID } from './tenant.constants';

describe('TenantResolverMiddleware', () => {
  let cls: ClsService;
  let ctx: TenantContextService;

  /**
   * Build a middleware instance with an optional mock for the subdomain resolver.
   * By default the resolver returns null (no subdomain match) so existing tests
   * continue to exercise the X-Org-Id / JWT paths without change.
   */
  const build = async (
    envOverrides: Record<string, string> = {},
    subdomainResolveResult: string | null = null,
  ) => {
    const mockSubdomainResolver: Partial<SubdomainResolverService> = {
      resolve: jest.fn().mockResolvedValue(subdomainResolveResult),
      invalidate: jest.fn(),
    };

    const mod = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({ global: true, middleware: { mount: false } }),
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ TENANT_ENFORCEMENT: 'off', DEFAULT_ORGANIZATION_ID, ...envOverrides })],
        }),
      ],
      providers: [
        TenantContextService,
        TenantResolverMiddleware,
        { provide: SubdomainResolverService, useValue: mockSubdomainResolver },
      ],
    }).compile();
    cls = mod.get(ClsService);
    ctx = mod.get(TenantContextService);
    return mod.get(TenantResolverMiddleware);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const req = (
    overrides: Partial<{
      user: unknown;
      headers: Record<string, unknown>;
      hostname: string;
      path: string;
      url: string;
      originalUrl: string;
    }> = {},
  ) =>
    ({
      user: undefined,
      headers: {},
      hostname: 'localhost',
      path: '/api/v1/dashboard/bookings',
      url: '/api/v1/dashboard/bookings',
      originalUrl: '/api/v1/dashboard/bookings',
      ...overrides,
    }) as never;

  it('off mode: does not set context, does not throw when unresolved', async () => {
    const mw = await build({ TENANT_ENFORCEMENT: 'off' });
    await new Promise<void>((done) => {
      cls.run(async () => {
        await mw.use(req(), {} as never, () => {
          expect(ctx.get()).toBeUndefined();
          done();
        });
      });
    });
  });

  it('permissive mode: falls back to default org when unresolved', async () => {
    const mw = await build({ TENANT_ENFORCEMENT: 'permissive' });
    await new Promise<void>((done) => {
      cls.run(async () => {
        await mw.use(req(), {} as never, () => {
          expect(ctx.getOrganizationId()).toBe(DEFAULT_ORGANIZATION_ID);
          done();
        });
      });
    });
  });

  it('permissive mode: prefers JWT claim over default', async () => {
    const mw = await build({ TENANT_ENFORCEMENT: 'permissive' });
    await new Promise<void>((done) => {
      cls.run(async () => {
        await mw.use(
          req({ user: { id: 'u1', organizationId: 'org-jwt', membershipId: 'm1', role: 'ADMIN' } }),
          {} as never,
          () => {
            expect(ctx.getOrganizationId()).toBe('org-jwt');
            done();
          },
        );
      });
    });
  });

  it('strict mode: private authenticated routes defer tenant resolution to JwtGuard', async () => {
    const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
    await new Promise<void>((done) => {
      cls.run(async () => {
        await mw.use(req({ originalUrl: '/api/v1/dashboard/bookings' }), {} as never, () => {
          expect(ctx.get()).toBeUndefined();
          done();
        });
      });
    });
  });

  it('strict mode: accepts explicit header when super-admin', async () => {
    const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
    const headerOrg = '550e8400-e29b-41d4-a716-446655440000';
    await new Promise<void>((done) => {
      cls.run(async () => {
        await mw.use(
          req({
            user: { id: 'u1', role: 'SUPER_ADMIN', isSuperAdmin: true },
            headers: { 'x-org-id': headerOrg },
          }),
          {} as never,
          () => {
            expect(ctx.getOrganizationId()).toBe(headerOrg);
            done();
          },
        );
      });
    });
  });

  it('strict mode: ignores x-org-id from non-super-admin (security)', async () => {
    const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
    await new Promise<void>((done) => {
      cls.run(async () => {
        await mw.use(
          req({
            user: { id: 'u1', organizationId: 'org-jwt', role: 'ADMIN' },
            headers: { 'x-org-id': 'org-attacker' },
          }),
          {} as never,
          () => {
            expect(ctx.getOrganizationId()).toBe('org-jwt'); // JWT wins
            done();
          },
        );
      });
    });
  });

  describe('public-route X-Org-Id resolution', () => {
    const VALID = '550e8400-e29b-41d4-a716-446655440000';

    it('strict mode: accepts X-Org-Id on unauthenticated public route', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              originalUrl: '/api/v1/public/services/departments',
              headers: { 'x-org-id': VALID },
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe(VALID);
              done();
            },
          );
        });
      });
    });

    it('strict mode: ignores X-Org-Id on authenticated public route (JWT wins)', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              user: { id: 'u1', organizationId: 'org-jwt', membershipId: 'm1', role: 'CLIENT' },
              originalUrl: '/api/v1/public/services/departments',
              headers: { 'x-org-id': VALID },
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe('org-jwt');
              done();
            },
          );
        });
      });
    });

    it('strict mode: ignores X-Org-Id on private route when unauthenticated and defers to JwtGuard', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              originalUrl: '/api/v1/dashboard/bookings',
              headers: { 'x-org-id': VALID },
            }),
            {} as never,
            () => {
              expect(ctx.get()).toBeUndefined();
              done();
            },
          );
        });
      });
    });

    it('strict mode: public routes without X-Org-Id pass through (handlers use requireOrganizationIdOrDefault)', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      await expect(
        new Promise<void>((resolve, reject) => {
          cls.run(async () => {
            try {
              await mw.use(
                req({ originalUrl: '/api/v1/public/services/departments' }),
                {} as never,
                () => undefined,
              );
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        }),
      ).rejects.toThrow(TenantResolutionError);
    });

    // Regression: confirm the boundary is explicit — /public routes without header
    // pass through, auth-bootstrap routes next to them do NOT.
    it('strict mode: /api/v1/public/services/departments without X-Org-Id passes through (boundary regression)', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      await expect(
        new Promise<void>((resolve, reject) => {
          cls.run(async () => {
            try {
              await mw.use(
                req({ originalUrl: '/api/v1/public/services/departments' }),
                {} as never,
                () => undefined,
              );
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        }),
      ).rejects.toThrow(TenantResolutionError);
    });

    it('strict mode: invalid UUID on public route treated as "not provided" — passes through', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      await expect(
        new Promise<void>((resolve, reject) => {
          cls.run(async () => {
            try {
              await mw.use(
                req({
                  originalUrl: '/api/v1/public/services/departments',
                  headers: { 'x-org-id': 'not-a-uuid' },
                }),
                {} as never,
                () => undefined,
              );
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        }),
      ).rejects.toThrow(TenantResolutionError);
    });

    it('strict mode: ignores X-Org-Id on /webhooks/ public route and defers to webhook guards', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              originalUrl: '/api/v1/public/sms/webhooks/unifonic/org-1',
              headers: { 'x-org-id': VALID },
            }),
            {} as never,
            () => {
              expect(ctx.get()).toBeUndefined();
              done();
            },
          );
        });
      });
    });
  });

  describe('CR-4: X-Org-Id binding to subdomain on public routes', () => {
    const ORG_A_ID = '550e8400-e29b-41d4-a716-446655440000';
    const ORG_B_ID = '660e8400-e29b-41d4-a716-446655440001';

    it('subdomain resolved + matching X-Org-Id header → 200, uses subdomain org', async () => {
      // clinic-a.deqah.net resolves to ORG_A_ID; header also sends ORG_A_ID
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, ORG_A_ID);
      await new Promise<void>((done) => {
        cls.run(() =>
          mw.use(
            req({
              originalUrl: '/api/v1/public/services/departments',
              hostname: 'clinic-a.deqah.net',
              headers: { host: 'clinic-a.deqah.net', 'x-org-id': ORG_A_ID },
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe(ORG_A_ID);
              done();
            },
          ),
        );
      });
    });

    it('subdomain resolved + mismatching X-Org-Id header → 400 BadRequest (cross-tenant attempt)', async () => {
      // clinic-a.deqah.net resolves to ORG_A_ID; header sends ORG_B_ID (attacker forged it)
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, ORG_A_ID);
      await expect(
        new Promise<void>((resolve, reject) => {
          cls.run(async () => {
            try {
              await mw.use(
                req({
                  originalUrl: '/api/v1/public/services/departments',
                  hostname: 'clinic-a.deqah.net',
                  headers: { host: 'clinic-a.deqah.net', 'x-org-id': ORG_B_ID },
                }),
                {} as never,
                () => resolve(),
              );
            } catch (e) {
              reject(e);
            }
          });
        }),
      ).rejects.toThrow('X-Org-Id does not match the resolved subdomain organization');
    });

    it('no subdomain (mobile hits raw API domain) + valid X-Org-Id → 200, mobile path preserved', async () => {
      // No subdomain resolves (resolver returns null) — mobile uses X-Org-Id only
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, null);
      await new Promise<void>((done) => {
        cls.run(() =>
          mw.use(
            req({
              originalUrl: '/api/v1/public/services/departments',
              hostname: 'api.deqah.net',
              headers: { host: 'api.deqah.net', 'x-org-id': ORG_A_ID },
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe(ORG_A_ID);
              done();
            },
          ),
        );
      });
    });

    it('subdomain resolved + no X-Org-Id header → 200, subdomain org used silently', async () => {
      // Dashboard/website hitting clinic-a.deqah.net without sending a header
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, ORG_A_ID);
      await new Promise<void>((done) => {
        cls.run(() =>
          mw.use(
            req({
              originalUrl: '/api/v1/public/services/departments',
              hostname: 'clinic-a.deqah.net',
              headers: { host: 'clinic-a.deqah.net' },
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe(ORG_A_ID);
              done();
            },
          ),
        );
      });
    });
  });

  describe('auth-bootstrap route bypass', () => {
    it('strict mode: passes through /auth/login without X-Org-Id and without JWT', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      let nextCalled = false;
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({ originalUrl: '/api/v1/auth/login' }),
            {} as never,
            () => {
              nextCalled = true;
              done();
            },
          );
        });
      });
      expect(nextCalled).toBe(true);
      expect(ctx.get()).toBeUndefined();
    });

    it('strict mode: passes through /auth/refresh without X-Org-Id', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      let nextCalled = false;
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({ originalUrl: '/api/v1/auth/refresh' }),
            {} as never,
            () => {
              nextCalled = true;
              done();
            },
          );
        });
      });
      expect(nextCalled).toBe(true);
      expect(ctx.get()).toBeUndefined();
    });

    it('strict mode: passes through /auth/logout without X-Org-Id', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      let nextCalled = false;
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({ originalUrl: '/api/v1/auth/logout' }),
            {} as never,
            () => {
              nextCalled = true;
              done();
            },
          );
        });
      });
      expect(nextCalled).toBe(true);
      expect(ctx.get()).toBeUndefined();
    });

    it('strict mode: passes through bare /auth/login (no global prefix) without X-Org-Id', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' });
      let nextCalled = false;
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({ originalUrl: '/auth/login' }),
            {} as never,
            () => {
              nextCalled = true;
              done();
            },
          );
        });
      });
      expect(nextCalled).toBe(true);
      expect(ctx.get()).toBeUndefined();
    });
  });

  describe('isPublicRoute()', () => {
    let mw: TenantResolverMiddleware;
    beforeEach(async () => {
      mw = await build({ TENANT_ENFORCEMENT: 'permissive' });
    });

    it('accepts /api/v1/public/* paths', () => {
      expect((mw as unknown as { isPublicRoute(p: string): boolean }).isPublicRoute('/api/v1/public/services/departments')).toBe(true);
    });

    it('rejects authenticated paths', () => {
      expect((mw as unknown as { isPublicRoute(p: string): boolean }).isPublicRoute('/api/v1/dashboard/bookings')).toBe(false);
    });

    it('rejects /api/v1/public/sms/webhooks/* (webhooks self-resolve)', () => {
      expect((mw as unknown as { isPublicRoute(p: string): boolean }).isPublicRoute('/api/v1/public/sms/webhooks/unifonic/org-1')).toBe(false);
    });
  });

  describe('parseUuidHeader()', () => {
    let mw: TenantResolverMiddleware;
    beforeEach(async () => {
      mw = await build({ TENANT_ENFORCEMENT: 'permissive' });
    });

    const parse = (v: unknown) =>
      (mw as unknown as { parseUuidHeader(v: unknown): string | undefined }).parseUuidHeader(v);

    it('accepts well-formed UUID', () => {
      expect(parse('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('accepts the all-zero DEFAULT_ORGANIZATION_ID', () => {
      expect(parse('00000000-0000-0000-0000-000000000001')).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('rejects non-string values', () => {
      expect(parse(undefined)).toBeUndefined();
      expect(parse(123)).toBeUndefined();
      expect(parse(null)).toBeUndefined();
    });

    it('rejects malformed UUIDs', () => {
      expect(parse('not-a-uuid')).toBeUndefined();
      expect(parse('550e8400-e29b-41d4-a716')).toBeUndefined();
      expect(parse('550e8400e29b41d4a716446655440000')).toBeUndefined();
    });

    it('trims whitespace', () => {
      expect(parse('  550e8400-e29b-41d4-a716-446655440000  ')).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('TenantResolverMiddleware — subdomain priority', () => {
    const SUBDOMAIN_ORG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const VALID_HEADER_ORG = '550e8400-e29b-41d4-a716-446655440000';

    it('strict mode: resolves tenant from subdomain when no JWT and no X-Org-Id header', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, SUBDOMAIN_ORG);
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              originalUrl: '/api/v1/public/branding',
              hostname: 'myclinic.deqah.net',
              headers: {},
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe(SUBDOMAIN_ORG);
              done();
            },
          );
        });
      });
    });

    it('subdomain is skipped when user is authenticated (JWT takes priority)', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, SUBDOMAIN_ORG);
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              user: { id: 'u1', organizationId: 'org-jwt', membershipId: 'm1', role: 'ADMIN' },
              hostname: 'myclinic.deqah.net',
              headers: {},
              originalUrl: '/api/v1/dashboard/bookings',
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe('org-jwt');
              done();
            },
          );
        });
      });
    });

    it('X-Org-Id on public route (priority #3) beats subdomain (priority #4)', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, SUBDOMAIN_ORG);
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              originalUrl: '/api/v1/public/services/departments',
              hostname: 'myclinic.deqah.net',
              headers: { 'x-org-id': VALID_HEADER_ORG },
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe(VALID_HEADER_ORG);
              done();
            },
          );
        });
      });
    });

    it('subdomain null → passes through on public route (handlers use requireOrganizationIdOrDefault)', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, null);
      let nextCalled = false;
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              originalUrl: '/api/v1/public/services/departments',
              hostname: 'localhost',
              headers: {},
            }),
            {} as never,
            () => {
              nextCalled = true;
              done();
            },
          );
        });
      });
      expect(nextCalled).toBe(true);
      expect(ctx.get()).toBeUndefined();
    });

    it('uses x-forwarded-host header over req.hostname when present', async () => {
      const mw = await build({ TENANT_ENFORCEMENT: 'strict' }, SUBDOMAIN_ORG);
      await new Promise<void>((done) => {
        cls.run(async () => {
          await mw.use(
            req({
              originalUrl: '/api/v1/public/branding',
              hostname: 'localhost',
              headers: { 'x-forwarded-host': 'myclinic.deqah.net' },
            }),
            {} as never,
            () => {
              expect(ctx.getOrganizationId()).toBe(SUBDOMAIN_ORG);
              done();
            },
          );
        });
      });
    });
  });
});
