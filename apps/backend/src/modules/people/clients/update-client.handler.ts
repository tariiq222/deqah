import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { UpdateClientDto } from './update-client.dto';
import { serializeClient } from './client.serializer';

export type UpdateClientCommand = UpdateClientDto & { clientId: string };

@Injectable()
export class UpdateClientHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: UpdateClientCommand) {
    const client = await this.prisma.client.findFirst({
      where: { id: cmd.clientId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Client not found');

    if (cmd.phone && cmd.phone !== client.phone) {
      const duplicate = await this.prisma.client.findFirst({
        where: {
          phone: cmd.phone,
          deletedAt: null,
          NOT: { id: cmd.clientId },
        },
      });
      if (duplicate) {
        throw new ConflictException({
          error: 'CLIENT_PHONE_EXISTS',
          message: 'Phone number already registered for this client',
        });
      }
    }

    const firstName = cmd.firstName ?? client.firstName ?? client.name;
    const middleName = cmd.middleName !== undefined ? cmd.middleName : client.middleName;
    const lastName = cmd.lastName ?? client.lastName ?? '';
    const composedName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();

    const updated = await this.prisma.client.update({
      where: { id: cmd.clientId },
      data: {
        name: composedName || client.name,
        firstName: cmd.firstName,
        middleName: cmd.middleName,
        lastName: cmd.lastName,
        phone: cmd.phone,
        email: cmd.email,
        gender: cmd.gender,
        dateOfBirth:
          cmd.dateOfBirth !== undefined ? (cmd.dateOfBirth ? new Date(cmd.dateOfBirth) : null) : undefined,
        nationality: cmd.nationality,
        nationalId: cmd.nationalId,
        emergencyName: cmd.emergencyName,
        emergencyPhone: cmd.emergencyPhone,
        bloodType: cmd.bloodType,
        allergies: cmd.allergies,
        chronicConditions: cmd.chronicConditions,
        avatarUrl: cmd.avatarUrl,
        notes: cmd.notes,
        source: cmd.source,
        accountType: cmd.accountType,
        isActive: cmd.isActive,
        preferredLocale: cmd.preferredLocale,
        pushEnabled: cmd.pushEnabled,
      },
    });

    return serializeClient(updated);
  }
}
