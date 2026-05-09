import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CreateVerticalAdminHandler } from './create-vertical-admin.handler';
import { PrismaService } from '../../../../infrastructure/database';

describe('CreateVerticalAdminHandler', () => {
  let handler: CreateVerticalAdminHandler;
  let vFindUnique: jest.Mock;
  let vCreate: jest.Mock;
  let logCreate: jest.Mock;

  beforeEach(async () => {
    vFindUnique = jest.fn();
    vCreate = jest.fn();
    logCreate = jest.fn();

    const tx = {
      vertical: { findUnique: vFindUnique, create: vCreate },
      superAdminActionLog: { create: logCreate },
    };
    const prismaMock = {
      $allTenants: {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateVerticalAdminHandler,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    handler = moduleRef.get(CreateVerticalAdminHandler);
  });

  const cmd = {
    superAdminUserId: 'sa1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
    data: {
      slug: 'spa',
      nameAr: 'سبا',
      nameEn: 'Spa',
      templateFamily: 'WELLNESS' as never,
    },
  };

  it('creates a vertical and writes audit log', async () => {
    vFindUnique.mockResolvedValue(null);
    vCreate.mockResolvedValue({ id: 'v1', slug: 'spa' });

    const result = await handler.execute(cmd);

    expect(result.id).toBe('v1');
    expect(logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionType: 'VERTICAL_CREATE',
        metadata: { verticalId: 'v1', slug: 'spa' },
      }),
    });
  });

  it('throws ConflictException when slug exists', async () => {
    vFindUnique.mockResolvedValue({ id: 'existing' });

    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ConflictException);
    expect(vCreate).not.toHaveBeenCalled();
  });
});
