import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZohoApiClient } from './zoho-api.client';
import { isZohoDataCenter, type ZohoDataCenter } from './zoho-dc';

/**
 * Runs once at application boot to disable Zoho's auto-numbering on the
 * **platform** Zoho org (used for SaaS subscription invoices). This ensures
 * the invoice_number we pass in the create-invoice payload is used verbatim
 * rather than overwritten by Zoho's own sequential counter.
 *
 * Failure is intentionally non-fatal: if Zoho is unreachable at boot time the
 * app continues normally. The flag will be applied on the next boot, or an
 * operator can trigger it manually.
 *
 * Per-tenant orgs are handled at connect time in SelectOrganizationHandler /
 * OAuthCallbackHandler — see those handlers for the tenant-side toggle.
 */
@Injectable()
export class ZohoBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ZohoBootstrapService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly api: ZohoApiClient,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const refreshToken = this.cfg.get<string>('ZOHO_PLATFORM_REFRESH_TOKEN');
    const zohoOrganizationId = this.cfg.get<string>('ZOHO_PLATFORM_ORGANIZATION_ID');
    const dcRaw = this.cfg.get<string>('ZOHO_PLATFORM_DC') ?? 'sa';

    if (!refreshToken || !zohoOrganizationId) {
      this.logger.debug('ZOHO_PLATFORM_REFRESH_TOKEN / ZOHO_PLATFORM_ORGANIZATION_ID not set — skipping bootstrap');
      return;
    }

    if (!isZohoDataCenter(dcRaw)) {
      this.logger.warn(`Invalid ZOHO_PLATFORM_DC "${dcRaw}" — skipping auto-numbering bootstrap`);
      return;
    }

    const ctx = {
      // Platform org itself is the "tenant" for cache-key purposes.
      organizationId: this.cfg.get<string>('DEFAULT_ORGANIZATION_ID') ?? '00000000-0000-0000-0000-000000000001',
      zohoOrganizationId,
      refreshToken,
      dataCenter: dcRaw as ZohoDataCenter,
    };

    try {
      await this.api.setAutoGenerateInvoiceNumber(ctx, false);
      this.logger.log('Platform Zoho auto-numbering disabled (invoice_number will use Deqah\'s number)');
    } catch (err) {
      this.logger.warn(
        `Failed to disable Zoho auto-numbering on platform org at boot: ${(err as Error).message}. ` +
        'Will retry on next application restart.',
      );
    }
  }
}
