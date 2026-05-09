import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StartImpersonationHandler } from './start-impersonation.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('StartImpersonationHandler', () => {
  let handler: StartImpersonationHandler;
  let userFindUnique: jest.Mock;
  let membershipFindFirst: jest.Mock;
  let sessionCreate: jest.Mock;
  let logCreate: jest.Mock;
  let sign: jest.Mock;

  beforeEach(async () => {
    userFindUnique = jest.fn();
    membershipFindFirst = jest.fn();
    sessionCreate = jest.fn();
    logCreate = jest.fn();
    sign = jest.fn().mockReturnValue('shadow.jwt.token');

    const tx = {
      impersonationSession: { create: sessionCreate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        user: { findUnique: userFindUnique },
        membership: { findFirst: membershipFindFirst },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        StartImpersonationHandler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: { sign } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'test-secret',
            get: (key: string) => (key === 'DASHBOARD_PUBLIC_URL' ? 'https://app.test' : undefined),
          },
        },
      ],
    }).compile();
    handler = moduleRef.get(StartImpersonationHandler);
  });

  const cmd = {
    superAdminUserId: 'sa1',
    organizationId: 'o1',
    targetUserId: 'u1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  const validUser = {
    id: 'u1',
    email: 'u@x.com',
    role: 'RECEPTIONIST',
    customRoleId: null,
    isSuperAdmin: false,
  };
  const validMembership = { id: 'm1', organizationId: 'o1' };

  it('issues a shadow JWT without isSuperAdmin and writes audit log', async () => {
    userFindUnique.mockResolvedValue(validUser);
    membershipFindFirst.mockResolvedValue(validMembership);
    sessionCreate.mockResolvedValue({ id: 'sess1' });

    const result = await handler.execute(cmd);

    expect(result.sessionId).toBe('sess1');
    expect(result.shadowAccessToken).toBe('shadow.jwt.token');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const payload = sign.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.scope).toBe('impersonation');
    expect(payload.impersonationSessionId).toBe('sess1');
    expect(payload.impersonatedBy).toBe('sa1');
    expect('isSuperAdmin' in payload).toBe(false);

    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'IMPERSONATE_START',
        impersonationSessionId: 'sess1',
        organizationId: 'o1',
      }),
    });
  });

  it('throws NotFoundException when target user missing', async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('refuses to impersonate another super-admin', async () => {
    userFindUnique.mockResolvedValue({ ...validUser, isSuperAdmin: true });
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ForbiddenException);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when target user has no membership in target org', async () => {
    userFindUnique.mockResolvedValue(validUser);
    membershipFindFirst.mockResolvedValue(null);
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
