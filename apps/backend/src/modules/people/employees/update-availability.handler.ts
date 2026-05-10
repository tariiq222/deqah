import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { AvailabilityWindow, UpdateAvailabilityDto } from './update-availability.dto';

export { AvailabilityWindow, AvailabilityException } from './update-availability.dto';

export type UpdateAvailabilityCommand = UpdateAvailabilityDto & {
  employeeId: string;
};

function validateTimeFormat(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function validateWindows(windows: AvailabilityWindow[]): void {
  const seenDays = new Set<number>();
  for (const w of windows) {
    if (w.dayOfWeek < 0 || w.dayOfWeek > 6) {
      throw new BadRequestException(`dayOfWeek must be 0–6, got ${w.dayOfWeek}`);
    }
    if (!validateTimeFormat(w.startTime) || !validateTimeFormat(w.endTime)) {
      throw new BadRequestException(`Invalid time format — expected HH:MM`);
    }
    if (timeToMinutes(w.startTime) >= timeToMinutes(w.endTime)) {
      throw new BadRequestException(`startTime must be before endTime for dayOfWeek ${w.dayOfWeek}`);
    }
    if (seenDays.has(w.dayOfWeek)) {
      throw new BadRequestException(`Duplicate dayOfWeek ${w.dayOfWeek} in windows`);
    }
    seenDays.add(w.dayOfWeek);
  }
}

@Injectable()
export class UpdateAvailabilityHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: UpdateAvailabilityCommand) {
    const { employeeId, windows, exceptions = [] } = cmd;

    validateWindows(windows);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found`);
    }

    const organizationId = employee.organizationId;

    const [createdWindows, updatedExceptions] = await this.rlsTx.withTransaction(
      async (tx) => {
        await tx.employeeAvailability.deleteMany({ where: { employeeId } });

        await tx.employeeAvailability.createMany({
          data: windows.map((w) => ({
            employeeId,
            organizationId,
            dayOfWeek: w.dayOfWeek,
            startTime: w.startTime,
            endTime: w.endTime,
            isActive: w.isActive ?? true,
          })),
        });

        await tx.employeeAvailabilityException.deleteMany({ where: { employeeId } });

        if (exceptions.length > 0) {
          await tx.employeeAvailabilityException.createMany({
            data: exceptions.map((e) => ({
              employeeId,
              organizationId,
              startDate: new Date(e.startDate),
              endDate: new Date(e.endDate),
              reason: e.reason ?? null,
            })),
          });
        }

        const exceptionResults = await tx.employeeAvailabilityException.findMany({
          where: { employeeId },
          orderBy: { startDate: 'asc' },
        });

        const windowRows = await tx.employeeAvailability.findMany({
          where: { employeeId },
          orderBy: { dayOfWeek: 'asc' },
        });

        return [windowRows, exceptionResults] as const;
      },
    );

    return { windows: createdWindows, exceptions: updatedExceptions };
  }
}
