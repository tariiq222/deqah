import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ResetUserPasswordHandler } from './reset-user-password.handler';
import { PrismaService } from '../../../../infrastructure/database';
import { PasswordService } from '../../../identity/shared/password.service';
import { SmtpService } from '../../../../infrastructure/mail';

describe('ResetUserPasswordHandler', () => {
  let handler: ResetUserPasswordHandler;
  let userFindUnique: jest.Mock;
  let userUpdate: jest.Mock;
  let logCreate: jest.Mock;
  let hash: jest.Mock;
  let isAvailable: jest.Mock;
  let sendMail: jest.Mock;

  beforeEach(async () => {
    userFindUnique = jest.fn();
    userUpdate = jest.fn();
    logCreate = jest.fn();
    hash = jest.fn().mockResolvedValue('hashed');
    isAvailable = jest.fn().mockReturnValue(true);
    sendMail = jest.fn().mockResolvedValue(undefined);

    const tx = {
      user: { update: userUpdate },
      superAdminActionLog: { create: logCreate },
    };

    const prismaMock = {
      $allTenants: {
        user: { findUnique: userFindUnique },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResetUserPasswordHandler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PasswordService, useValue: { hash } },
        { provide: SmtpService, useValue: { isAvailable, sendMail } },
      ],
    }).compile();

    handler = moduleRef.get(ResetUserPasswordHandler);
  });

  const cmd = {
    targetUserId: 'u1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('issues temp password and writes audit log + email', async () => {
    userFindUnique.mockResolvedValue({ id: 'u1', email: 'u@x.com', name: 'U' });

    const result = await handler.execute(cmd);

    expect(result.tempPasswordIssued).toBe(true);
    expect(hash).toHaveBeenCalledWith(expect.any(String));
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'hashed' },
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'RESET_PASSWORD',
        organizationId: null,
        metadata: { targetUserId: 'u1' },
      }),
    });
    expect(sendMail).toHaveBeenCalledWith(
      'u@x.com',
      'Deqah — Temporary password issued',
      expect.stringContaining('temporary password'),
    );
  });

  it('throws NotFoundException when user does not exist', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('skips email when SMTP is unavailable', async () => {
    isAvailable.mockReturnValue(false);
    userFindUnique.mockResolvedValue({ id: 'u1', email: 'u@x.com', name: 'U' });

    const result = await handler.execute(cmd);

    expect(result.tempPasswordIssued).toBe(true);
    expect(userUpdate).toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('escapes user name in email body', async () => {
    isAvailable.mockReturnValue(true);
    userFindUnique.mockResolvedValue({ id: 'u1', email: 'u@x.com', name: '<script>X</script>' });

    await handler.execute(cmd);

    const html = sendMail.mock.calls[0][2] as string;
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>X</script>');
  });
});
