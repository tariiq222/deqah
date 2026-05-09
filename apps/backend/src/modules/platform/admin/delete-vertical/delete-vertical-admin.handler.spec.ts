import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeleteVerticalAdminHandler } from './delete-vertical-admin.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('DeleteVerticalAdminHandler', () => {
  let handler: DeleteVerticalAdminHandler;
  let vFindUnique: jest.Mock;
  let vUpdate: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    vFindUnique = jest.fn();
    vUpdate = jest.fn();
    logCreate = jest.fn();

    const tx = {
      vertical: { findUnique: vFindUnique, update: vUpdate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeleteVerticalAdminHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    handler = moduleRef.get(DeleteVerticalAdminHandler);
  });

  const cmd = {
    verticalId: 'v1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('soft-deletes a vertical with no orgs', async () => {
    vFindUnique.mockResolvedValue({ id: 'v1', isActive: true, _count: { organizations: 0 } });

    await handler.execute(cmd);

    expect(vUpdate).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { isActive: false },
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ actionType: 'VERTICAL_DELETE' }),
    });
  });

  it('throws NotFoundException when vertical missing', async () => {
    vFindUnique.mockResolvedValue(null);
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when already inactive', async () => {
    vFindUnique.mockResolvedValue({ id: 'v1', isActive: false, _count: { organizations: 0 } });
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when in use by organizations', async () => {
    vFindUnique.mockResolvedValue({ id: 'v1', isActive: true, _count: { organizations: 3 } });
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(vUpdate).not.toHaveBeenCalled();
  });
});
