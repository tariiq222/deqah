import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientAccountType, ClientGender, ClientSource } from '@prisma/client';
import { CreateClientHandler } from './create-client.handler';
import { UpdateClientHandler } from './update-client.handler';
import { ListClientsHandler } from './list-clients.handler';
import { GetClientHandler } from './get-client.handler';
import { DeleteClientHandler } from './delete-client.handler';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { TenantContextService } from '../../../common/tenant';

const mockClient = {
  id: 'c1',
  userId: null,
  name: 'أحمد محمد',
  firstName: 'أحمد',
  middleName: null,
  lastName: 'محمد',
  phone: '+966501234567',
  email: 'ahmed@example.com',
  gender: ClientGender.MALE,
  dateOfBirth: new Date('1990-01-01'),
  nationality: null,
  nationalId: null,
  emergencyName: null,
  emergencyPhone: null,
  bloodType: null,
  allergies: null,
  chronicConditions: null,
  avatarUrl: null,
  notes: null,
  source: ClientSource.WALK_IN,
  accountType: ClientAccountType.WALK_IN,
  claimedAt: null,
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Clients handlers', () => {
  let createHandler: CreateClientHandler;
  let updateHandler: UpdateClientHandler;
  let listHandler: ListClientsHandler;
  let getHandler: GetClientHandler;
  let deleteHandler: DeleteClientHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CreateClientHandler,
        UpdateClientHandler,
        ListClientsHandler,
        GetClientHandler,
        DeleteClientHandler,
        {
          provide: PrismaService,
          useValue: {
            client: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            booking: {
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
        { provide: EventBusService, useValue: { publish: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: TenantContextService,
          useValue: { requireOrganizationIdOrDefault: () => 'org-test' },
        },
      ],
    }).compile();

    createHandler = module.get(CreateClientHandler);
    updateHandler = module.get(UpdateClientHandler);
    listHandler = module.get(ListClientsHandler);
    getHandler = module.get(GetClientHandler);
    deleteHandler = module.get(DeleteClientHandler);
    prisma = module.get(PrismaService);
  });

  describe('CreateClientHandler', () => {
    it('composes name from first/middle/last and creates a client', async () => {
      prisma.client.findFirst.mockResolvedValue(null);
      prisma.client.create.mockResolvedValue(mockClient);

      const result = await createHandler.execute({
        firstName: 'أحمد',
        lastName: 'محمد',
        phone: '+966501234567',
        gender: ClientGender.MALE,
      });

      expect(result.id).toBe('c1');
      expect(result.gender).toBe('male'); // serialized lowercase
      expect(result.accountType).toBe('walk_in'); // serialized lowercase
      expect(prisma.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'أحمد محمد',
            firstName: 'أحمد',
            lastName: 'محمد',
            organizationId: 'org-test',
          }),
        }),
      );
    });

    it('throws ConflictException when phone already registered for a non-deleted client', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);

      await expect(
        createHandler.execute({
          firstName: 'آخر',
          lastName: 'مختلف',
          phone: '+966501234567',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('UpdateClientHandler', () => {
    it('updates fields and re-composes name', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.client.update.mockResolvedValue({ ...mockClient, firstName: 'محمد', lastName: 'أحمد', name: 'محمد أحمد' });

      const result = await updateHandler.execute({
        clientId: 'c1',
        firstName: 'محمد',
        lastName: 'أحمد',
      });

      expect(result.firstName).toBe('محمد');
      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({ firstName: 'محمد', lastName: 'أحمد', name: 'محمد أحمد' }),
        }),
      );
    });

    it('checks phone uniqueness when phone changes', async () => {
      prisma.client.findFirst
        .mockResolvedValueOnce(mockClient) // initial existence check
        .mockResolvedValueOnce({ id: 'c2' }); // duplicate check returns another client

      await expect(
        updateHandler.execute({ clientId: 'c1', phone: '+966501111111' }),
      ).rejects.toThrow(ConflictException);
    });

    it('skips uniqueness check when phone is unchanged', async () => {
      prisma.client.findFirst.mockResolvedValueOnce(mockClient);
      prisma.client.update.mockResolvedValue(mockClient);

      await updateHandler.execute({ clientId: 'c1', phone: mockClient.phone });

      // Only the existence lookup — no duplicate query
      expect(prisma.client.findFirst).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when client not found', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        updateHandler.execute({ clientId: 'c1', firstName: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates preferredLocale and pushEnabled', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.client.update.mockResolvedValue({
        ...mockClient,
        preferredLocale: 'en',
        pushEnabled: false,
      });

      const result = await updateHandler.execute({
        clientId: 'c1',
        preferredLocale: 'en',
        pushEnabled: false,
      });

      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ preferredLocale: 'en', pushEnabled: false }),
        }),
      );
      expect(result.preferredLocale).toBe('en');
      expect(result.pushEnabled).toBe(false);
    });
  });

  describe('ListClientsHandler', () => {
    it('returns items + meta excluding deleted clients', async () => {
      prisma.client.findMany.mockResolvedValue([mockClient]);
      prisma.client.count.mockResolvedValue(1);

      const result = await listHandler.execute({ page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, perPage: 10, totalPages: 1 });
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('applies search across name/firstName/lastName/phone/email', async () => {
      prisma.client.findMany.mockResolvedValue([]);
      prisma.client.count.mockResolvedValue(0);

      await listHandler.execute({ page: 1, limit: 10, search: 'أحمد' });

      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });
  });

  describe('GetClientHandler', () => {
    it('returns serialized client (lowercase enums)', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);

      const result = await getHandler.execute({ clientId: 'c1' });

      expect(result.id).toBe('c1');
      expect(result.gender).toBe('male');
      expect(result.accountType).toBe('walk_in');
    });

    it('throws NotFoundException when deleted', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(getHandler.execute({ clientId: 'c1' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('DeleteClientHandler', () => {
    it('soft-deletes by setting deletedAt and nulling phone', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);
      prisma.client.update.mockResolvedValue({ ...mockClient, deletedAt: new Date(), phone: null });

      await deleteHandler.execute({ clientId: 'c1' });

      expect(prisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            isActive: false,
            phone: null,
          }),
        }),
      );
    });

    it('throws NotFoundException when client does not exist or is already deleted', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(deleteHandler.execute({ clientId: 'c1' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
