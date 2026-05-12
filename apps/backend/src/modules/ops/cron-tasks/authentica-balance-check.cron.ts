import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticaClient } from '../../../infrastructure/authentica/authentica.client';
import { PlatformMailerService } from '../../../infrastructure/mail/platform-mailer.service';

/** Balance below this threshold triggers an alert email (SAR / units depending on Authentica plan). */
const LOW_BALANCE_THRESHOLD = 500;

@Injectable()
export class AuthenticaBalanceCheckCron {
  private readonly logger = new Logger(AuthenticaBalanceCheckCron.name);
  private readonly ownerAlertEmail: string | undefined;

  constructor(
    private readonly authentica: AuthenticaClient,
    private readonly mailer: PlatformMailerService,
    config: ConfigService,
  ) {
    this.ownerAlertEmail = config.get<string>('OWNER_ALERT_EMAIL');
  }

  async execute(): Promise<void> {
    if (!this.authentica.isConfigured()) {
      this.logger.warn('Authentica not configured — skipping balance check');
      return;
    }

    const balance = await this.authentica.getBalance();
    this.logger.log(`Authentica balance: ${balance}`);

    if (balance < LOW_BALANCE_THRESHOLD) {
      this.logger.warn(
        `Authentica balance LOW: ${balance} < threshold ${LOW_BALANCE_THRESHOLD}`,
      );

      if (!this.ownerAlertEmail) {
        this.logger.warn(
          'OWNER_ALERT_EMAIL not set — cannot send balance alert email',
        );
        return;
      }

      await this.mailer.sendRaw({
        to: this.ownerAlertEmail,
        subject: `تحذير: رصيد Authentica منخفض · Authentica Balance Low`,
        html: `
          <p dir="rtl">رصيد Authentica الحالي <strong>${balance}</strong> أقل من الحد الأدنى (${LOW_BALANCE_THRESHOLD}). يرجى إعادة الشحن لضمان استمرار إرسال OTP.</p>
          <p>Current Authentica balance is <strong>${balance}</strong>, which is below the low-balance threshold of ${LOW_BALANCE_THRESHOLD}. Please top up to ensure continued OTP delivery.</p>
        `,
        templateSlug: 'authentica-balance-alert',
      });

      this.logger.log(`Balance alert email sent to ${this.ownerAlertEmail}`);
    }
  }
}
