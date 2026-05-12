import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';

export interface LogActivityCommand {
  userId?: string;
  userEmail?: string;
  action: ActivityAction;
  entity: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class LogActivityHandler {
  private readonly logger = new Logger(LogActivityHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(cmd: LogActivityCommand): Promise<void> {
    try {
      const organizationId = this.tenant.requireOrganizationIdOrDefault();
      await this.prisma.activityLog.create({
        data: {
          organizationId,
          userId: cmd.userId,
          userEmail: cmd.userEmail,
          action: cmd.action,
          entity: cmd.entity,
          entityId: cmd.entityId,
          description: cmd.description,
          metadata: cmd.metadata ? (cmd.metadata as Prisma.InputJsonValue) : undefined,
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });
    } catch (err) {
      this.logger.error(
        `ActivityLog write failed (action=${cmd.action} entity=${cmd.entity}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
