import { Test } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { ListMembershipsHandler } from './list-memberships.handler';
import { PrismaService } from '../../../infrastructure/database';

describe('ListMembershipsHandler', () => {
  let handler: ListMembershipsHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let findMany: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        ListMembershipsHandler,
        {
          provide: PrismaService,
          useValue: {
            $allTenants: { membership: { findMany } },
          } as unknown as PrismaService,
        },
        {
          provide: ClsService,
          useValue: {
            run: jest.fn().mockImplementation((fn: () => unknown) => fn()),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get(ListMembershipsHandler);
  });

  it('returns only active memberships for the given user', async () => {
    findMany.mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'org-a',
        role: 'OWNER',
        isActive: true,
        displayName: null,
        jobTitle: null,
        avatarUrl: null,
        organization: {
          id: 'org-a',
          slug: 'clinic-a',
          nameAr: 'العيادة أ',
          nameEn: 'Clinic A',
          status: 'ACTIVE',
        },
      },
    ]);

    const result = await handler.execute({ userId: 'u1' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', isActive: true },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.organization.nameAr).toBe('العيادة أ');
  });

  it('returns [] when the user has no memberships', async () => {
    findMany.mockResolvedValue([]);
    const result = await handler.execute({ userId: 'u-missing' });
    expect(result).toEqual([]);
  });
});
