import { Global, Module } from '@nestjs/common';
import { ZohoCredentialsService } from './zoho-credentials.service';
import { ZohoOAuthService } from './zoho-oauth.service';
import { ZohoApiClient } from './zoho-api.client';
import { ZohoAuditService } from './zoho-audit.service';
import { ZohoWebhookVerifier } from './zoho-webhook.verifier';
import { ZohoBootstrapService } from './zoho-bootstrap.service';

/**
 * Shared, stateless Zoho infrastructure — used by both the per-tenant
 * `zoho-invoice` integration module and the platform-level `saas-billing/zoho`
 * module. Marked `@Global` so any consumer can inject these without a
 * cascade of module-level imports.
 */
@Global()
@Module({
  providers: [
    ZohoCredentialsService,
    ZohoOAuthService,
    ZohoApiClient,
    ZohoAuditService,
    ZohoWebhookVerifier,
    ZohoBootstrapService,
  ],
  exports: [
    ZohoCredentialsService,
    ZohoOAuthService,
    ZohoApiClient,
    ZohoAuditService,
    ZohoWebhookVerifier,
    ZohoBootstrapService,
  ],
})
export class ZohoInfrastructureModule {}
