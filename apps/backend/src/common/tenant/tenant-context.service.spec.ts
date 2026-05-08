import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClsModule, ClsService } from 'nestjs-cls';
import { TenantContextService, TenantContext } from './tenant-context.service';
import { DEFAULT_ORGANIZATION_ID } from './tenant.constants';
import { UnauthorizedTenantAccessError } from './tenant.errors';

describe('TenantContextService', () => {
  let cls: ClsService;
  let svc: TenantContextService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
      providers: [
        TenantContextService,
        // Provide permissive mode so the legacy fallback tests remain valid
        // (they pre-date P1.2 hardening; new strict-mode tests live in their own describe block below).
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('permissive') },
        },
      ],
    }).compile();

    cls = mod.get(ClsService);
    svc = mod.get(TenantContextService);
  });

  const ctx: TenantContext = {
    organizationId: 'org-1',
    membershipId: 'mem-1',
    id: 'user-1',
    role: 'ADMIN',
    isSuperAdmin: false,
  };

  it('returns undefined when context is not set', () => {
    cls.run(() => {
      expect(svc.get()).toBeUndefined();
      expect(svc.getOrganizationId()).toBeUndefined();
    });
  });

  it('stores and reads context within a CLS run', () => {
    cls.run(() => {
      svc.set(ctx);
      expect(svc.get()).toEqual(ctx);
      expect(svc.getOrganizationId()).toBe('org-1');
      expect(svc.getMembershipId()).toBe('mem-1');
    });
  });

  it('isolates context per run', async () => {
    await Promise.all([
      cls.run(async () => {
        svc.set({ ...ctx, organizationId: 'org-A' });
        await new Promise((r) => setTimeout(r, 10));
        expect(svc.getOrganizationId()).toBe('org-A');
      }),
      cls.run(async () => {
        svc.set({ ...ctx, organizationId: 'org-B' });
        await new Promise((r) => setTimeout(r, 10));
        expect(svc.getOrganizationId()).toBe('org-B');
      }),
    ]);
  });

  it('requireOrganizationId throws when missing', () => {
    cls.run(() => {
      expect(() => svc.requireOrganizationId()).toThrow(/tenant context not set/i);
    });
  });

  it('requireOrganizationId returns the id when set', () => {
    cls.run(() => {
      svc.set(ctx);
      expect(svc.requireOrganizationId()).toBe('org-1');
    });
  });

  it('requireOrganizationIdOrDefault falls back to DEFAULT_ORGANIZATION_ID when no context', () => {
    cls.run(() => {
      expect(svc.requireOrganizationIdOrDefault()).toBe(DEFAULT_ORGANIZATION_ID);
    });
  });

  it('requireOrganizationIdOrDefault returns the current org when set', () => {
    cls.run(() => {
      svc.set(ctx);
      expect(svc.requireOrganizationIdOrDefault()).toBe('org-1');
    });
  });

  describe('requireOrganizationIdOrDefault — strict guard (P1.2)', () => {
    let strictCls: ClsService;
    let strictSvc: TenantContextService;
    let permissiveCls: ClsService;
    let permissiveSvc: TenantContextService;

    beforeEach(async () => {
      // Module with strict enforcement
      const strictMod = await Test.createTestingModule({
        imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
        providers: [
          TenantContextService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('strict') },
          },
        ],
      }).compile();
      strictCls = strictMod.get(ClsService);
      strictSvc = strictMod.get(TenantContextService);

      // Module with permissive enforcement
      const permissiveMod = await Test.createTestingModule({
        imports: [ClsModule.forRoot({ global: true, middleware: { mount: false } })],
        providers: [
          TenantContextService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('permissive') },
          },
        ],
      }).compile();
      permissiveCls = permissiveMod.get(ClsService);
      permissiveSvc = permissiveMod.get(TenantContextService);
    });

    it('throws UnauthorizedTenantAccessError under strict mode when no tenant is set', () => {
      strictCls.run(() => {
        expect(() => strictSvc.requireOrganizationIdOrDefault()).toThrow(
          UnauthorizedTenantAccessError,
        );
      });
    });

    it('returns DEFAULT_ORGANIZATION_ID under permissive mode when no tenant is set', () => {
      permissiveCls.run(() => {
        expect(permissiveSvc.requireOrganizationIdOrDefault()).toBe(DEFAULT_ORGANIZATION_ID);
      });
    });

    it('returns the resolved tenant id under strict mode when tenant is set', () => {
      strictCls.run(() => {
        strictSvc.set(ctx);
        expect(strictSvc.requireOrganizationIdOrDefault()).toBe('org-1');
      });
    });
  });
});
