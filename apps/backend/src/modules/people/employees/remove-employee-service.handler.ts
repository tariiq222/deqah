import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface RemoveEmployeeServiceCommand { employeeId: string; serviceId: string; }

@Injectable()
export class RemoveEmployeeServiceHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: RemoveEmployeeServiceCommand): Promise<void> {
    const record = await this.prisma.employeeService.findUnique({
      where: { employeeId_serviceId: { employeeId: cmd.employeeId, serviceId: cmd.serviceId } },
    });
    if (!record) {
      throw new NotFoundException('Service assignment not found');
    }
    await this.prisma.employeeService.delete({
      where: { employeeId_serviceId: { employeeId: cmd.employeeId, serviceId: cmd.serviceId } },
    });
  }
}
