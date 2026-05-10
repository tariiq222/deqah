import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  ZohoApiClient,
  ZohoOAuthService,
  type ZohoIntegrationConfig,
} from '../../../../infrastructure/zoho';
import { ZohoConfigService } from '../zoho-config.service';
import type { ZohoTenantContext } from '../../../../infrastructure/zoho';

interface CallbackInput {
  code?: string;
  state?: string;
  error?: string;
  /** Zoho passes `location` in the redirect query for the actual DC. */
  location?: string;
  /** Zoho passes `accounts-server` for the DC accounts host. */
  accountsServer?: string;
}

interface CallbackResult {
  organizationId: string;
  pendingOrganizationSelection: boolean;
  dashboardRedirectUrl: string;
}

/**
 * Completes the OAuth dance: validates the signed state, exchanges the
 * authorization code for {access_token, refresh_token}, lists the user's
 * Zoho organizations, auto-selects when only one exists (and currency=SAR),
 * otherwise stores a pending config and asks the dashboard to prompt the
 * user to pick an org.
 */
@Injectable()
export class OAuthCallbackHandler {
  private readonly logger = new Logger(OAuthCallbackHandler.name);

  constructor(
    private readonly oauth: ZohoOAuthService,
    private readonly api: ZohoApiClient,
    private readonly config: ZohoConfigService,
    private readonly cfg: ConfigService,
  ) {}

  async execute(input: CallbackInput): Promise<CallbackResult> {
    if (input.error) {
      throw new BadRequestException(`Zoho consent denied: ${input.error}`);
    }
    if (!input.code || !input.state) {
      throw new BadRequestException('Missing OAuth code or state');
    }
    const state = this.oauth.verifyState(input.state);

    const { tokens, dataCenter } = await this.oauth.exchangeCodeForTokens({
      code: input.code,
      dataCenter: state.dataCenter,
    });

    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      throw new BadRequestException('Zoho did not return a refresh token — retry consent');
    }

    // List orgs to auto-pick or surface the picker.
    const orgs = await this.api.listOrganizations({
      organizationId: state.organizationId,
      refreshToken,
      dataCenter,
    });

    const sarOrgs = orgs.organizations.filter((o) => o.currency_code === 'SAR');
    if (sarOrgs.length === 0) {
      throw new BadRequestException(
        'None of your Zoho organizations use SAR currency. Deqah currently supports SAR only — change your Zoho org currency or reconnect with a different account.',
      );
    }

    const baseConfig: Omit<ZohoIntegrationConfig, 'zohoOrganizationId' | 'zohoOrganizationName'> = {
      refreshToken,
      dataCenter,
      webhookSecret: randomBytes(32).toString('hex'),
      defaults: { sendOnCreate: true },
    };

    if (sarOrgs.length === 1) {
      const only = sarOrgs[0];
      await this.config.save(state.organizationId, {
        ...baseConfig,
        zohoOrganizationId: only.organization_id,
        zohoOrganizationName: only.name,
      });
      // Disable Zoho's own invoice numbering so Deqah's invoice_number
      // is recorded verbatim. Non-fatal: log warn and continue on failure.
      try {
        const apiCtx: ZohoTenantContext = {
          organizationId: state.organizationId,
          zohoOrganizationId: only.organization_id,
          refreshToken,
          dataCenter,
        };
        await this.api.setAutoGenerateInvoiceNumber(apiCtx, false);
      } catch (err) {
        this.logger.warn(
          `Could not disable Zoho auto-numbering for org ${state.organizationId}: ${(err as Error).message}`,
        );
      }
      return {
        organizationId: state.organizationId,
        pendingOrganizationSelection: false,
        dashboardRedirectUrl: this.dashboardRedirect('connected'),
      };
    }

    // Multiple SAR orgs — store the partial config and ask the user to pick.
    await this.config.save(
      state.organizationId,
      {
        ...baseConfig,
        zohoOrganizationId: '',
      },
      { isActive: false },
    );
    return {
      organizationId: state.organizationId,
      pendingOrganizationSelection: true,
      dashboardRedirectUrl: this.dashboardRedirect('select-org'),
    };
  }

  private dashboardRedirect(status: 'connected' | 'select-org'): string {
    const base =
      this.cfg.get<string>('DASHBOARD_PUBLIC_URL') ??
      this.cfg.get<string>('PLATFORM_DASHBOARD_URL') ??
      'http://localhost:5103';
    return `${base.replace(/\/$/, '')}/dashboard/integrations/zoho?status=${status}`;
  }
}
