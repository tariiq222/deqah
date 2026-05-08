import { Injectable } from '@nestjs/common';
import { Prisma, SuperAdminActionType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface LogPlatformSettingUpdateCommand {
  superAdminUserId: string;
  settingKey: string;
  previousValue: unknown;
  nextValue: unknown;
  settingIsSecret?: boolean;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class LogPlatformSettingUpdateHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: LogPlatformSettingUpdateCommand): Promise<void> {
    const previousValue = cmd.settingIsSecret ? '***' : cmd.previousValue;
    const nextValue = cmd.settingIsSecret ? '***' : cmd.nextValue;

    await this.prisma.$allTenants.superAdminActionLog.create({
      data: {
        superAdminUserId: cmd.superAdminUserId,
        actionType: SuperAdminActionType.PLATFORM_SETTING_UPDATED,
        reason: `Platform setting updated: ${cmd.settingKey}`,
        metadata: {
          settingKey: cmd.settingKey,
          previousValue,
          nextValue,
        } as Prisma.InputJsonValue,
        ipAddress: cmd.ipAddress,
        userAgent: cmd.userAgent,
      },
    });
  }
}
