import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { SetEmployeeBreaksDto } from './set-employee-breaks.dto';

export type SetEmployeeBreaksCommand = SetEmployeeBreaksDto & { employeeId: string };

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

@Injectable()
export class SetEmployeeBreaksHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: SetEmployeeBreaksCommand) {
    const { employeeId, breaks } = cmd;

    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    for (const b of breaks) {
      if (timeToMinutes(b.startTime) >= timeToMinutes(b.endTime)) {
        throw new BadRequestException(
          `Break on day ${b.dayOfWeek}: startTime must be before endTime`,
        );
      }
    }

    if (breaks.length > 0) {
      const shifts = await this.prisma.employeeAvailability.findMany({
        where: { employeeId },
      });

      for (const b of breaks) {
        const dayShifts = shifts.filter((s) => s.dayOfWeek === b.dayOfWeek);
        if (dayShifts.length === 0) {
          throw new BadRequestException(
            `Break on day ${b.dayOfWeek}: no shift exists for this day`,
          );
        }
        const fits = dayShifts.some(
          (s) =>
            timeToMinutes(b.startTime) >= timeToMinutes(s.startTime) &&
            timeToMinutes(b.endTime) <= timeToMinutes(s.endTime),
        );
        if (!fits) {
          throw new BadRequestException(
            `Break on day ${b.dayOfWeek}: falls outside every shift window for that day`,
          );
        }
      }
    }

    const result = await this.rlsTx.withTransaction(
      async (tx) => {
        await tx.employeeBreak.deleteMany({ where: { employeeId } });

        if (breaks.length > 0) {
          await tx.employeeBreak.createMany({
            data: breaks.map((b) => ({
              employeeId,
              organizationId: employee.organizationId,
              dayOfWeek: b.dayOfWeek,
              startTime: b.startTime,
              endTime: b.endTime,
            })),
          });
        }

        return tx.employeeBreak.findMany({
          where: { employeeId },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });
      },
    );

    return { breaks: result };
  }
}
