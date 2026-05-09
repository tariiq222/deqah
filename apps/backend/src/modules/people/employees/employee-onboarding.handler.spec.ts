import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RlsHelper } from '../../../common/tenant/rls.helper';
import { EmployeeOnboardingHandler } from './employee-onboarding.handler';

const OnboardingStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

const mockEmployee = {
  id: 'emp-1',
  onboardingStatus: OnboardingStatus.PENDING,
  name: 'Ahmed',
  organizationId: 'org-test',
};

describe('EmployeeOnboardingHandler', () => {
  let handler: EmployeeOnboardingHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let mockRls: jest.Mocked<Pick<RlsHelper, 'applyInTransaction' | 'runWithoutTenant'>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRls = {
      applyInTransaction: jest.fn().mockResolvedValue(undefined),
      runWithoutTenant: jest.fn(),
    };

    prisma = {
      employee: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      employeeBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      employeeService: { deleteMany: jest.fn(), createMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeOnboardingHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: RlsHelper, useValue: mockRls },
      ],
    }).compile();

    handler = module.get(EmployeeOnboardingHandler);
    prisma = module.get(PrismaService);
  });

  describe('employee not found', () => {
    it('throws NotFoundException when employee does not exist', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        handler.execute({ employeeId: 'emp-1', step: 'profile' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('profile step', () => {
    it('updates employee fields and sets onboardingStatus to IN_PROGRESS when PENDING', async () => {
      const updated = { ...mockEmployee, name: 'Ali', onboardingStatus: OnboardingStatus.IN_PROGRESS };
      prisma.employee.findFirst.mockResolvedValueOnce(mockEmployee);
      prisma.employee.findUnique.mockResolvedValueOnce(updated);
      prisma.employee.update.mockResolvedValue(updated);

      const result = await handler.execute({
        employeeId: 'emp-1',
        step: 'profile',
        profile: { name: 'Ali' },
      });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { name: 'Ali', onboardingStatus: OnboardingStatus.IN_PROGRESS },
      });
      expect(result).toEqual(updated);
    });

    it('does not override onboardingStatus when already IN_PROGRESS', async () => {
      const inProgressEmployee = { ...mockEmployee, onboardingStatus: OnboardingStatus.IN_PROGRESS };
      prisma.employee.findFirst.mockResolvedValueOnce(inProgressEmployee);
      prisma.employee.findUnique.mockResolvedValueOnce(inProgressEmployee);
      prisma.employee.update.mockResolvedValue(inProgressEmployee);

      await handler.execute({
        employeeId: 'emp-1',
        step: 'profile',
        profile: { name: 'Ali' },
      });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { name: 'Ali' },
      });
    });
  });

  describe('branches step', () => {
    it('replaces branches inside a transaction', async () => {
      prisma.employee.findFirst.mockResolvedValueOnce(mockEmployee);
      prisma.employee.findUnique.mockResolvedValueOnce(mockEmployee);
      prisma.employeeBranch.deleteMany.mockResolvedValue({ count: 1 });
      prisma.employeeBranch.createMany.mockResolvedValue({ count: 1 });
      prisma.employee.update.mockResolvedValue(mockEmployee);

      await handler.execute({ employeeId: 'emp-1', step: 'branches', branchIds: ['br-1'] });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.employeeBranch.deleteMany).toHaveBeenCalledWith({ where: { employeeId: 'emp-1' } });
      expect(prisma.employeeBranch.createMany).toHaveBeenCalledWith({
        data: [{ employeeId: 'emp-1', organizationId: 'org-test', branchId: 'br-1' }],
      });
    });
  });

  describe('complete step', () => {
    it('sets onboardingStatus to COMPLETED when profile+branches+services are filled', async () => {
      const readyEmployee = {
        ...mockEmployee,
        name: 'Ahmed',
        branches: [{ id: 'eb1' }],
        services: [{ id: 'ev1' }],
        onboardingStatus: OnboardingStatus.IN_PROGRESS,
      };
      const completed = { ...readyEmployee, onboardingStatus: OnboardingStatus.COMPLETED };

      prisma.employee.findFirst.mockResolvedValueOnce(mockEmployee);
      prisma.employee.findUnique
        .mockResolvedValueOnce(readyEmployee)
        .mockResolvedValueOnce(completed);
      prisma.employee.update.mockResolvedValue(completed);

      const result = await handler.execute({ employeeId: 'emp-1', step: 'complete' });

      expect(prisma.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { onboardingStatus: OnboardingStatus.COMPLETED },
      });
      expect(result).toEqual(completed);
    });

    it('throws BadRequestException when profile/branches/services are incomplete', async () => {
      const incompleteEmployee = {
        ...mockEmployee,
        name: 'Ahmed',
        branches: [],
        services: [],
        onboardingStatus: OnboardingStatus.IN_PROGRESS,
      };

      prisma.employee.findFirst.mockResolvedValueOnce(mockEmployee);
      prisma.employee.findUnique.mockResolvedValueOnce(incompleteEmployee);

      await expect(
        handler.execute({ employeeId: 'emp-1', step: 'complete' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
