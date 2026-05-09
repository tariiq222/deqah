import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UpdateVerticalAdminHandler } from './update-vertical-admin.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('UpdateVerticalAdminHandler', () => {
  let handler: UpdateVerticalAdminHandler;
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
        UpdateVerticalAdminHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    handler = moduleRef.get(UpdateVerticalAdminHandler);
  });

  const cmd = {
    verticalId: 'v1',
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
    data: { nameAr: 'صحة' },
  };

  it('updates a vertical and writes audit log', async () => {
    vFindUnique.mockResolvedValue({ id: 'v1' });
    vUpdate.mockResolvedValue({ id: 'v1', nameAr: 'صحة' });

    await handler.execute(cmd);

    expect(vUpdate).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { nameAr: 'صحة' },
    });
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'VERTICAL_UPDATE',
        metadata: expect.objectContaining({ verticalId: 'v1', changedFields: ['nameAr'] }),
      }),
    });
  });

  it('throws NotFoundException when vertical missing', async () => {
    vFindUnique.mockResolvedValue(null);

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(NotFoundException);
  });
});
