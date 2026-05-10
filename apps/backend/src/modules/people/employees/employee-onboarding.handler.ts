import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OnboardingStatus } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { EmployeeOnboardingDto } from './employee-onboarding.dto';

export type EmployeeOnboardingCommand = EmployeeOnboardingDto & {
  employeeId: string;
};

type RelationStep = 'branches' | 'services';

const RELATION_CONFIG = {
  branches: {
    table: 'employeeBranch' as const,
    idField: 'branchId' as const,
    idsKey: 'branchIds' as const,
  },
  services: {
    table: 'employeeService' as const,
    idField: 'serviceId' as const,
    idsKey: 'serviceIds' as const,
  },
} satisfies Record<RelationStep, { table: string; idField: string; idsKey: keyof EmployeeOnboardingCommand }>;

@Injectable()
export class EmployeeOnboardingHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: EmployeeOnboardingCommand) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: cmd.employeeId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${cmd.employeeId} not found`);
    }

    return this.rlsTx.withTransaction(async (tx) => {
      switch (cmd.step) {
        case 'profile': {
          await tx.employee.update({
            where: { id: cmd.employeeId },
            data: {
              ...cmd.profile,
              ...(employee.onboardingStatus === OnboardingStatus.PENDING && {
                onboardingStatus: OnboardingStatus.IN_PROGRESS,
              }),
            },
          });
          break;
        }

        case 'branches':
        case 'services': {
          const config = RELATION_CONFIG[cmd.step];
          const ids = (cmd[config.idsKey] as string[] | undefined) ?? [];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (tx[config.table] as any).deleteMany({ where: { employeeId: cmd.employeeId } });
          if (ids.length) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (tx[config.table] as any).createMany({
              data: ids.map((id) => ({
                employeeId: cmd.employeeId,
                organizationId: employee.organizationId,
                [config.idField]: id,
              })),
            });
          }

          if (employee.onboardingStatus === OnboardingStatus.PENDING) {
            await tx.employee.update({
              where: { id: cmd.employeeId },
              data: { onboardingStatus: OnboardingStatus.IN_PROGRESS },
            });
          }
          break;
        }

        case 'complete': {
          const current = await tx.employee.findUnique({
            where: { id: cmd.employeeId },
            include: { branches: true, services: true },
          });

          if (
            !current ||
            !current.name ||
            current.branches.length === 0 ||
            current.services.length === 0
          ) {
            throw new BadRequestException(
              'Cannot complete onboarding: profile, branches, and services must all be filled',
            );
          }

          await tx.employee.update({
            where: { id: cmd.employeeId },
            data: { onboardingStatus: OnboardingStatus.COMPLETED },
          });
          break;
        }
      }

      return tx.employee.findUnique({
        where: { id: cmd.employeeId },
        include: { branches: true, services: true },
      });
    });
  }
}
