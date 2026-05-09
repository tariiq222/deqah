import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface DeleteClientCommand {
  clientId: string;
}

@Injectable()
export class DeleteClientHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: DeleteClientCommand) {
    const client = await this.prisma.client.findFirst({
      where: { id: cmd.clientId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Client not found');

    // Soft delete: set deletedAt, force inactive, and null the phone so the
    // unique phone constraint no longer blocks re-creating a client with the same
    // number. The original phone is preserved in notes for audit.
    await this.prisma.client.update({
      where: { id: cmd.clientId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        phone: null,
        notes: client.phone ? `${client.notes ?? ''}\n[deleted-phone:${client.phone}]`.trim() : client.notes,
      },
    });
  }
}
