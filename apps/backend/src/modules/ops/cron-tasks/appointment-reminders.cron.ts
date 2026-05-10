import { Injectable, Logger } from '@nestjs/common';
import { WaitlistStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { withCronLeader } from '../../../common/helpers/cron-leader.helper';

@Injectable()
export class AppointmentRemindersCron {
  private readonly logger = new Logger(AppointmentRemindersCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async execute(): Promise<void> {
    // SAFE: cron job running as platform-level op; sets SUPER_ADMIN_CONTEXT explicitly.
    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      await withCronLeader(this.prisma, 'appointment-reminders', async () => {
        const waiting = await this.prisma.$allTenants.waitlistEntry.findMany({
          where: { status: WaitlistStatus.WAITING },
          orderBy: { createdAt: 'asc' },
          take: 50,
        });
        if (waiting.length > 0) {
          this.logger.log(`${waiting.length} waitlist entries checked`);
        }
      });
    });
  }
}
