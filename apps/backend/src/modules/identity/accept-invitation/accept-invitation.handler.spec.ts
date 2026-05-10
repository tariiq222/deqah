import { Test } from '@nestjs/testing';
import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import { AcceptInvitationHandler } from './accept-invitation.handler';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { PasswordService } from '../shared/password.service';

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    email: 'ahmad@clinic.sa',
    role: 'RECEPTIONIST',
    token: 't'.repeat(64),
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 86_400_000),
    invitedByUserId: 'admin-1',
    acceptedAt: null,
    revokedAt: null,
    displayName: 'د. أحمد',
    jobTitle: 'استشاري',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AcceptInvitationHandler', () => {
  let handler: AcceptInvitationHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let password: jest.Mocked<PasswordService>;

  beforeEach(async () => {
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'new-user' }) },
      membership: {
        upsert: jest.fn().mockResolvedValue({ id: 'm-1', organizationId: 'org-1' }),
      },
      invitation: { update: jest.fn().mockResolvedValue({}) },
    };

    const module = await Test.createTestingModule({
      providers: [
        AcceptInvitationHandler,
        {
          provide: PrismaService,
          useValue: {
            invitation: {
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
            },
            user: { findUnique: jest.fn() },
            $transaction: jest.fn().mockImplementation(async (cb) => cb(tx)),
            __tx: tx,
          } as unknown as PrismaService,
        },
        {
          provide: PasswordService,
          useValue: { hash: jest.fn().mockResolvedValue('hashed') },
        },
        {
          provide: RlsTransactionService,
          useValue: {
            withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
          },
        },
      ],
    }).compile();

    handler = module.get(AcceptInvitationHandler);
    prisma = module.get(PrismaService);
    password = module.get(PasswordService);
  });

  it('links a Membership silently when the email already has a User', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user', isActive: true });

    const out = await handler.execute({ token: 't'.repeat(64) });

    expect(out.userPreExisting).toBe(true);
    expect(prisma.__tx.user.create).not.toHaveBeenCalled();
    expect(prisma.__tx.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_organizationId: { userId: 'existing-user', organizationId: 'org-1' } },
      }),
    );
  });

  it('creates a User then a Membership when no account exists', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.user.findUnique.mockResolvedValue(null);

    const out = await handler.execute({
      token: 't'.repeat(64),
      password: 'StrongP4ss',
      name: 'أحمد',
    });

    expect(out.userPreExisting).toBe(false);
    expect(password.hash).toHaveBeenCalledWith('StrongP4ss');
    expect(prisma.__tx.user.create).toHaveBeenCalled();
    expect(prisma.__tx.membership.upsert).toHaveBeenCalled();
  });

  it('rejects new-account branch without password/name', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pendingInvite());
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute({ token: 't'.repeat(64) }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException for an unknown token', async () => {
    prisma.invitation.findUnique.mockResolvedValue(null);
    await expect(handler.execute({ token: 'x'.repeat(64) })).rejects.toThrow(NotFoundException);
  });

  it('throws GoneException for an already-accepted invitation', async () => {
    prisma.invitation.findUnique.mockResolvedValue(pendingInvite({ status: 'ACCEPTED' }));
    await expect(handler.execute({ token: 't'.repeat(64) })).rejects.toThrow(GoneException);
  });

  it('throws GoneException + lazily marks EXPIRED for stale invitations', async () => {
    prisma.invitation.findUnique.mockResolvedValue(
      pendingInvite({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(handler.execute({ token: 't'.repeat(64) })).rejects.toThrow(GoneException);
    expect(prisma.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'EXPIRED' },
    });
  });
});
