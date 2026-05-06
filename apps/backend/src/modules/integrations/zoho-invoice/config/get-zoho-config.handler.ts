import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContextService } from '../../../../common/tenant';
import { ZohoConfigService } from '../zoho-config.service';
import type { ZohoIntegrationStatus } from '../../../../infrastructure/zoho';

/**
 * Returns the dashboard-facing status of the Zoho Invoice integration.
 *
 * Secrets (refresh token, full webhook secret) are never returned. The
 * `webhookUrl` shown here is the public route the tenant must register in
 * Zoho's Setup → Automation → Webhooks. The webhook secret is shown ONCE
 * at Connect time (separate response) and afterwards only a fingerprint
 * could be displayed; we keep it simple by returning a "configured"
 * boolean instead.
 */
@Injectable()
export class GetZohoConfigHandler {
  constructor(
    private readonly config: ZohoConfigService,
    private readonly tenant: TenantContextService,
    private readonly cfg: ConfigService,
  ) {}

  async execute(): Promise<ZohoIntegrationStatus & { webhookConfigured: boolean }> {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const result = await this.config.load(organizationId);
    if (!result.isConfigured || !result.config) {
      return { isConfigured: false, isActive: false, webhookConfigured: false };
    }
    const webhookUrl = this.buildWebhookUrl(organizationId);
    return {
      isConfigured: true,
      isActive: result.isActive,
      dataCenter: result.config.dataCenter,
      zohoOrganizationName: result.config.zohoOrganizationName,
      zohoOrganizationId: result.config.zohoOrganizationId,
      defaults: result.config.defaults,
      webhookUrl,
      webhookConfigured: Boolean(result.config.webhookSecret),
    };
  }

  private buildWebhookUrl(organizationId: string): string {
    // Webhook URL must point at the BACKEND's public origin — Zoho's servers
    // POST here from the internet. DASHBOARD_PUBLIC_URL is the dashboard host
    // (e.g. app.deqah.app) and won't route to the API in production. Prefer
    // API_PUBLIC_URL; fall back to legacy SMS_WEBHOOK_URL_BASE for backwards
    // compatibility, then dev localhost as a last resort.
    const base =
      this.cfg.get<string>('API_PUBLIC_URL') ||
      this.cfg.get<string>('SMS_WEBHOOK_URL_BASE') ||
      'http://localhost:5100';
    return `${base.replace(/\/$/, '')}/public/webhooks/zoho/${organizationId}`;
  }
}
