import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateTenantHandler } from './create-tenant.handler';
import { OwnerProvisioningService } from '../../../identity/owner-provisioning/owner-provisioning.service';

describe('CreateTenantHandler', () => {
  const tx = {
    organization: { findUnique: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    vertical: { findFirst: jest.fn() },
    plan: { findUnique: jest.fn() },
    membership: { create: jest.fn() },
    brandingConfig: { create: jest.fn() },
    organizationSettings: { create: jest.fn() },
    department: { create: jest.fn() },
    serviceCategory: { create: jest.fn() },
    subscription: { create: jest.fn() },
    superAdminActionLog: { create: jest.fn() },
  };

  const prisma = {};

  const rlsTx = {
    withBypassTransaction: jest.fn(async (fn: (arg: typeof tx) => unknown) => fn(tx)),
  };

  const mailer = { sendTenantWelcome: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('https://app.webvue.pro/dashboard') };
  const subdomainResolver = { invalidate: jest.fn().mockResolvedValue(undefined) };

  const ownerProvisioning = {
    provision: jest.fn(),
  } as unknown as OwnerProvisioningService;

  const handler = new CreateTenantHandler(
    prisma as never,
    rlsTx as never,
    ownerProvisioning,
    mailer as never,
    config as never,
    subdomainResolver as never,
  );

  const cmd = {
    slug: 'riyadh-clinic',
    nameAr: 'عيادة الرياض',
    nameEn: 'Riyadh Clinic',
    ownerUserId: 'owner-1',
    verticalSlug: 'clinic',
    planId: 'plan-1',
    billingCycle: 'MONTHLY' as const,
    trialDays: 10,
    superAdminUserId: 'sa-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.organization.findUnique.mockResolvedValue(null);
    tx.organization.create.mockResolvedValue({
      id: 'org-1',
      slug: cmd.slug,
      nameAr: cmd.nameAr,
      nameEn: cmd.nameEn,
      status: 'TRIALING',
      verticalId: 'vertical-1',
      trialEndsAt: new Date('2026-05-09T00:00:00.000Z'),
    });
    (ownerProvisioning.provision as jest.Mock).mockResolvedValue({
      userId: 'owner-1',
      isNewUser: false,
    });
    tx.vertical.findFirst.mockResolvedValue({
      id: 'vertical-1',
      slug: 'clinic',
      seedDepartments: [{ nameAr: 'الطب العام', nameEn: 'General', sortOrder: 1 }],
      seedServiceCategories: [{ nameAr: 'كشف', nameEn: 'Consultation', sortOrder: 1 }],
    });
    tx.plan.findUnique.mockResolvedValue({ id: 'plan-1', slug: 'STARTER', isActive: true });
    tx.subscription.create.mockResolvedValue({ id: 'sub-1' });
  });

  it('rejects when neither ownerUserId nor ownerEmail is provided', async () => {
    const { ownerUserId: _removed, ...cmdWithoutOwner } = cmd;
    await expect(handler.execute(cmdWithoutOwner)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate slug', async () => {
    tx.organization.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it('rejects missing owner user via provision service', async () => {
    (ownerProvisioning.provision as jest.Mock).mockRejectedValue(
      new NotFoundException('owner_user_not_found'),
    );

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it('creates organization and owner membership', async () => {
    await handler.execute(cmd);

    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: cmd.slug,
        nameAr: cmd.nameAr,
        nameEn: cmd.nameEn,
        status: 'TRIALING',
        verticalId: 'vertical-1',
      }),
      select: expect.any(Object),
    });
    expect(tx.membership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'owner-1',
        role: 'OWNER',
        isActive: true,
      }),
    });
  });

  it('creates default branding and organization settings', async () => {
    await handler.execute(cmd);

    expect(tx.brandingConfig.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        organizationNameAr: cmd.nameAr,
        organizationNameEn: cmd.nameEn,
      },
    });
    expect(tx.organizationSettings.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        companyNameAr: cmd.nameAr,
        companyNameEn: cmd.nameEn,
      },
    });
  });

  it('seeds vertical departments and categories when verticalSlug is provided', async () => {
    await handler.execute(cmd);

    expect(tx.department.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org-1', nameAr: 'الطب العام' }),
    });
    expect(tx.serviceCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org-1', nameAr: 'كشف' }),
    });
  });

  it('creates subscription when planId is provided', async () => {
    await handler.execute(cmd);

    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        planId: 'plan-1',
        status: 'TRIALING',
        billingCycle: 'MONTHLY',
      }),
      select: { id: true },
    });
  });

  it('writes super-admin audit log with null reason and metadata flags', async () => {
    await handler.execute(cmd);

    expect(tx.superAdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        superAdminUserId: 'sa-1',
        actionType: 'TENANT_CREATE',
        organizationId: 'org-1',
        reason: null,
        metadata: expect.objectContaining({
          slug: cmd.slug,
          ownerUserId: 'owner-1',
          ownerCreatedNew: false,
          passwordWasGenerated: false,
          verticalSlug: 'clinic',
          planId: 'plan-1',
          subscriptionId: 'sub-1',
        }),
      }),
    });
  });

  it('invalidates subdomain cache after creating the organization', async () => {
    await handler.execute(cmd);

    expect(subdomainResolver.invalidate).toHaveBeenCalledWith(cmd.slug);
  });

  it('sends welcome email for newly created owner via email path', async () => {
    const cmdWithEmail = { ...cmd, ownerUserId: undefined, ownerEmail: 'new@example.com', ownerName: 'New User', ownerPhone: '+966501234567' };
    (ownerProvisioning.provision as jest.Mock).mockResolvedValue({
      userId: 'new-user-1',
      isNewUser: true,
      generatedPassword: 'TempPass7',
    });

    await handler.execute(cmdWithEmail);

    expect(mailer.sendTenantWelcome).toHaveBeenCalledWith(
      'new@example.com',
      expect.objectContaining({
        ownerName: 'New User',
        generatedPassword: 'TempPass7',
      }),
    );
  });

  it('does not send welcome email when linking an existing user', async () => {
    const cmdWithEmail = { ...cmd, ownerUserId: undefined, ownerEmail: 'existing@example.com' };
    (ownerProvisioning.provision as jest.Mock).mockResolvedValue({
      userId: 'existing-user-1',
      isNewUser: false,
    });

    await handler.execute(cmdWithEmail);

    expect(mailer.sendTenantWelcome).not.toHaveBeenCalled();
  });
});
