import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmployeeGender, EmploymentType } from '@prisma/client';
import { CreateEmployeeHandler } from './create-employee.handler';
import { UpdateEmployeeHandler } from './update-employee.handler';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { SubscriptionCacheService } from '../../platform/billing/subscription-cache.service';

const DEFAULT_ORG = 'org-test';
const employeeId = 'e1';

const mockEmployee = {
  id: employeeId,
  userId: null,
  name: 'د. سارة الأحمد',
  phone: '0551234567',
  email: 'sara@clinic.com',
  gender: EmployeeGender.FEMALE,
  avatarUrl: null,
  bio: null,
  employmentType: EmploymentType.FULL_TIME,
  isActive: true,
  organizationId: DEFAULT_ORG,
  createdAt: new Date(),
  updatedAt: new Date(),
  branches: [],
  services: [],
};

const mockEmployeeInactive = { ...mockEmployee, isActive: false };

const buildEventBus = () => ({ publish: jest.fn().mockResolvedValue(undefined) });
const buildTenant = (organizationId = DEFAULT_ORG) =>
  ({
    requireOrganizationIdOrDefault: jest.fn().mockReturnValue(organizationId),
    requireOrganizationId: jest.fn().mockReturnValue(organizationId),
  }) as unknown as TenantContextService;

describe('Employees handlers', () => {
  let createHandler: CreateEmployeeHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CreateEmployeeHandler,
        {
          provide: PrismaService,
          useValue: (() => {
            const employee = { findFirst: jest.fn(), create: jest.fn() };
            return {
              employee,
              $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
                fn({ employee }),
              ),
            };
          })(),
        },
        {
          provide: TenantContextService,
          useValue: { requireOrganizationIdOrDefault: () => 'org-test' },
        },
        {
          provide: EventBusService,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: SubscriptionCacheService,
          useValue: { get: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    createHandler = module.get(CreateEmployeeHandler);
    prisma = module.get(PrismaService);
  });

  describe('CreateEmployeeHandler', () => {
    it('creates employee successfully', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(mockEmployee);

      const result = await createHandler.execute({
        name: 'د. سارة الأحمد',
        email: 'sara@clinic.com',
        gender: EmployeeGender.FEMALE,
      });

      expect(result.id).toBe('e1');
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'د. سارة الأحمد',
            organizationId: 'org-test',
          }),
          include: { branches: true, services: true },
        }),
      );
    });

    it('creates employee with branches + services', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue({
        ...mockEmployee,
        branches: [{ id: 'eb1', branchId: 'br1', employeeId: 'e1' }],
      });

      const result = await createHandler.execute({
        name: 'د. سارة الأحمد',
        branchIds: ['br1'],
      });

      expect(result.branches).toHaveLength(1);
      expect(prisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-test',
            branches: { create: [{ branchId: 'br1', organizationId: 'org-test' }] },
          }),
        }),
      );
    });

    it('skips email uniqueness check when no email provided', async () => {
      prisma.employee.create.mockResolvedValue({ ...mockEmployee, email: null });

      await createHandler.execute({ name: 'موظف بدون إيميل' });

      expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    });

    it('throws ConflictException when email already registered', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);

      await expect(
        createHandler.execute({ name: 'آخر', email: 'sara@clinic.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

describe('UpdateEmployeeHandler (direct)', () => {
  const buildPrisma = () => ({
    employee: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  });

  it('throws NotFoundException when employee not found', async () => {
    const prisma = buildPrisma();
    prisma.employee.findFirst = jest.fn().mockResolvedValue(null);
    const handler = new UpdateEmployeeHandler(prisma as never, buildTenant(), buildEventBus() as never);
    await expect(handler.execute({ employeeId, nameAr: 'Test' })).rejects.toThrow(NotFoundException);
  });

  it('emits EmployeeDeactivatedEvent when isActive transitions true → false', async () => {
    const prisma = buildPrisma();
    prisma.employee.findFirst = jest.fn().mockResolvedValue(mockEmployee); // isActive: true
    prisma.employee.update = jest.fn().mockResolvedValue({ ...mockEmployee, isActive: false });
    const eventBus = buildEventBus();
    const handler = new UpdateEmployeeHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ employeeId, isActive: false });

    expect(eventBus.publish).toHaveBeenCalledWith(
      'people.employee.deactivated',
      expect.objectContaining({
        payload: { employeeId, organizationId: DEFAULT_ORG },
      }),
    );
  });

  it('emits EmployeeReactivatedEvent when isActive transitions false → true', async () => {
    const prisma = buildPrisma();
    prisma.employee.findFirst = jest.fn().mockResolvedValue(mockEmployeeInactive); // isActive: false
    prisma.employee.update = jest.fn().mockResolvedValue({ ...mockEmployee, isActive: true });
    const eventBus = buildEventBus();
    const handler = new UpdateEmployeeHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ employeeId, isActive: true });

    expect(eventBus.publish).toHaveBeenCalledWith(
      'people.employee.reactivated',
      expect.objectContaining({
        payload: { employeeId, organizationId: DEFAULT_ORG },
      }),
    );
  });

  it('emits no lifecycle event when isActive does not change', async () => {
    const prisma = buildPrisma();
    prisma.employee.findFirst = jest.fn().mockResolvedValue(mockEmployee); // isActive: true
    prisma.employee.update = jest.fn().mockResolvedValue(mockEmployee);
    const eventBus = buildEventBus();
    const handler = new UpdateEmployeeHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ employeeId, isActive: true }); // same value

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('emits no lifecycle event when isActive is not in the update payload', async () => {
    const prisma = buildPrisma();
    prisma.employee.findFirst = jest.fn().mockResolvedValue(mockEmployee);
    prisma.employee.update = jest.fn().mockResolvedValue(mockEmployee);
    const eventBus = buildEventBus();
    const handler = new UpdateEmployeeHandler(prisma as never, buildTenant(), eventBus as never);

    await handler.execute({ employeeId, nameAr: 'خالد' }); // no isActive in payload

    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
