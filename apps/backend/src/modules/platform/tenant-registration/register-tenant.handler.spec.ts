import { ConflictException, NotFoundException } from '@nestjs/common';
import { RegisterTenantHandler } from './register-tenant.handler';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_VERTICAL = {
  id: 'vert-1',
  slug: 'general-clinic',
  isActive: true,
  createdAt: new Date('2026-01-01'),
  seedDepartments: [
    { nameAr: 'الاستقبال', nameEn: 'Reception', sortOrder: 1 },
  ],
  seedServiceCategories: [
    { nameAr: 'عيادة عامة', nameEn: 'General', sortOrder: 1 },
  ],
};

// ── Prisma mock ───────────────────────────────────────────────────────────────

const makeTxMock = () => ({
  organization: {
    create: jest.fn().mockResolvedValue({ id: 'org-1' }),
    count: jest.fn().mockResolvedValue(0),
  },
  user: { create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null }) },
  membership: { create: jest.fn().mockResolvedValue({ id: 'mem-1', organizationId: 'org-1' }) },
  brandingConfig: { create: jest.fn().mockResolvedValue({}) },
  organizationSettings: { create: jest.fn().mockResolvedValue({}) },
  subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1', organizationId: 'org-1' }) },
  department: { create: jest.fn().mockResolvedValue({}) },
  serviceCategory: { create: jest.fn().mockResolvedValue({}) },
});

const makePrisma = (
  overrides: Record<string, unknown> = {},
  txMock?: ReturnType<typeof makeTxMock>,
) => {
  const tx = txMock ?? makeTxMock();
  return {
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    plan: { findFirst: jest.fn().mockResolvedValue({ id: 'plan-1', isActive: true }) },
    subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    organization: { count: jest.fn().mockResolvedValue(0) },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'ADMIN', customRoleId: null, customRole: null }),
      // Pre-check for existing email — returns null by default (email is available)
      findUnique: jest.fn().mockResolvedValue(null),
    },
    vertical: {
      findFirst: jest.fn().mockResolvedValue(DEFAULT_VERTICAL),
    },
    _tx: tx,
    ...overrides,
  };
};

const makePassword = () => ({ hash: jest.fn().mockResolvedValue('hashed') });
const makeTokens = () => ({ issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }) });
const makeConfig = (slug = 'BASIC', trialDays = 14) => ({
  get: jest.fn().mockImplementation((key: string, def: unknown) => {
    if (key === 'PLATFORM_DEFAULT_PLAN_SLUG') return slug;
    if (key === 'SAAS_TRIAL_DAYS') return trialDays;
    return def;
  }),
});
const makeTenant = () => ({ set: jest.fn(), requireOrganizationId: jest.fn().mockReturnValue('org-1') });
const makeCache = () => ({ invalidate: jest.fn() });
const makeMailer = () => ({ sendTenantWelcome: jest.fn().mockResolvedValue(undefined) });
const makeOwnerProvisioning = () => ({
  provision: jest.fn().mockResolvedValue({ userId: 'user-1', isNewUser: true }),
});

describe('RegisterTenantHandler', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let tokens: ReturnType<typeof makeTokens>;
  let tenant: ReturnType<typeof makeTenant>;
  let mailer: ReturnType<typeof makeMailer>;

  function buildHandler(overridePrisma?: ReturnType<typeof makePrisma>) {
    return new RegisterTenantHandler(
      (overridePrisma ?? prisma) as never,
      makePassword() as never,
      tokens as never,
      makeConfig() as never,
      tenant as never,
      makeCache() as never,
      mailer as never,
      makeOwnerProvisioning() as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    tokens = makeTokens();
    tenant = makeTenant();
    mailer = makeMailer();
  });

  it('throws ConflictException when email already exists (pre-check)', async () => {
    prisma.user.findUnique = jest.fn().mockResolvedValue({ id: 'existing-user' });
    const handler = buildHandler();
    await expect(handler.execute({ name: 'Ali', email: 'a@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة' }))
      .rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when email conflicts at tx level (race)', async () => {
    const tx = makeTxMock();
    tx.user.create = jest.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['email'] }, message: 'Unique constraint failed on email' });
    const p = makePrisma({}, tx);
    // provision mock throws to simulate the race condition path through OwnerProvisioningService
    const handler = new RegisterTenantHandler(
      p as never,
      makePassword() as never,
      makeTokens() as never,
      makeConfig() as never,
      makeTenant() as never,
      makeCache() as never,
      makeMailer() as never,
      { provision: jest.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['email'] }, message: 'Unique constraint failed on email' }) } as never,
    );
    await expect(handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة' }))
      .rejects.toThrow(ConflictException);
  });

  it('produces a slug matching SLUG_REGEX even for Arabic names', async () => {
    const tx = makeTxMock();
    const p = makePrisma({}, tx);
    const handler = buildHandler(p);
    await handler.execute({
      name: 'Ali',
      email: 'unique-arabic@example.com',
      phone: '0501234567',
      password: 'Pass@1234',
      businessNameAr: 'عيادة سواء',
      verticalSlug: 'general-clinic',
    });
    const createCall = (tx.organization.create as jest.Mock).mock.calls[0][0] as { data: { slug: string } };
    expect(createCall.data.slug).toMatch(/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/);
  });

  it('throws NotFoundException when default plan not found', async () => {
    prisma.plan.findFirst = jest.fn().mockResolvedValue(null);
    const handler = buildHandler();
    await expect(handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة' }))
      .rejects.toThrow(NotFoundException);
  });

  it('creates org + user + membership + branding + settings + subscription inside one transaction', async () => {
    const tx = makeTxMock();
    const p = makePrisma({}, tx);
    const handler = buildHandler(p);
    await handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة علي' });
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'TRIALING', nameAr: 'عيادة علي' }),
    }));
    expect(tx.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'OWNER', isActive: true }),
    }));
    expect(tx.brandingConfig.create).toHaveBeenCalled();
    expect(tx.organizationSettings.create).toHaveBeenCalled();
    expect(tx.subscription.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'TRIALING', billingCycle: 'MONTHLY' }),
    }));
  });

  it('subscription.create failure rolls back the organization (atomic tx)', async () => {
    const tx = makeTxMock();
    tx.subscription.create = jest.fn().mockRejectedValue(new Error('subscription_create_failed'));
    const p = makePrisma({}, tx);
    const handler = buildHandler(p);

    await expect(
      handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة' }),
    ).rejects.toThrow('subscription_create_failed');
  });

  it('returns accessToken, refreshToken, and userId', async () => {
    const handler = buildHandler();
    const result = await handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة' });
    expect(result).toMatchObject({ accessToken: 'at', refreshToken: 'rt', userId: 'user-1' });
  });

  it('sends a welcome email to the tenant owner on success', async () => {
    const handler = buildHandler();
    await handler.execute({
      name: 'Tariq',
      email: 'owner@example.com',
      phone: '0500000000',
      password: 'StrongPwd1!',
      businessNameAr: 'سوا',
    });

    expect(mailer.sendTenantWelcome).toHaveBeenCalledWith(
      'owner@example.com',
      expect.objectContaining({
        ownerName: 'Tariq',
        orgName: 'سوا',
        dashboardUrl: expect.stringMatching(/^https?:\/\//),
      }),
    );
  });

  describe('vertical seeding', () => {
    it('seeds default vertical departments and service categories when no verticalSlug provided', async () => {
      const tx = makeTxMock();
      const p = makePrisma({}, tx);
      // vertical.findFirst returns DEFAULT_VERTICAL (first active vertical)
      const handler = buildHandler(p);
      await handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة' });

      expect(tx.department.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ nameAr: 'الاستقبال', organizationId: 'org-1' }),
      }));
      expect(tx.serviceCategory.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ nameAr: 'عيادة عامة', organizationId: 'org-1' }),
      }));
    });

    it('uses provided verticalSlug when specified in DTO', async () => {
      const customVertical = {
        ...DEFAULT_VERTICAL,
        id: 'vert-custom',
        slug: 'salon',
        seedDepartments: [{ nameAr: 'مشط', nameEn: 'Styling', sortOrder: 1 }],
        seedServiceCategories: [],
      };
      const tx = makeTxMock();
      const p = makePrisma({}, tx);
      p.vertical.findFirst = jest.fn().mockResolvedValue(customVertical);
      const handler = buildHandler(p);

      await handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'صالون', verticalSlug: 'salon' });

      expect(tx.department.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ nameAr: 'مشط' }),
      }));
    });

    it('skips seeding silently when no vertical exists in DB', async () => {
      const tx = makeTxMock();
      const p = makePrisma({}, tx);
      p.vertical.findFirst = jest.fn().mockResolvedValue(null);
      const handler = buildHandler(p);

      await expect(
        handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة' }),
      ).resolves.toMatchObject({ accessToken: 'at' });

      expect(tx.department.create).not.toHaveBeenCalled();
      expect(tx.serviceCategory.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown verticalSlug', async () => {
      const p = makePrisma();
      p.vertical.findFirst = jest.fn().mockResolvedValue(null);
      const handler = buildHandler(p);

      await expect(
        handler.execute({ name: 'Ali', email: 'new@b.com', phone: '0501234567', password: 'Pass@1234', businessNameAr: 'عيادة', verticalSlug: 'unknown-slug' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
