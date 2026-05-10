import { Global, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContextService } from './tenant-context.service';
import { RlsHelper } from './rls.helper';
import { TenantEnforcementMode } from './tenant.constants';
import { SubdomainResolverService } from './subdomain-resolver.service';

@Global()
@Module({
  providers: [TenantContextService, RlsHelper, SubdomainResolverService],
  exports: [TenantContextService, RlsHelper, SubdomainResolverService],
})
export class TenantModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantModule.name);

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    const mode = this.config.get<TenantEnforcementMode>('TENANT_ENFORCEMENT', 'strict');
    const env = process.env.NODE_ENV ?? 'development';

    if (mode !== 'strict' && env === 'production') {
      // Fail-fast: refuse to boot a multi-tenant SaaS in production with
      // tenant scoping bypassed. Logging without throwing previously left a
      // `permissive`/`off` boot fully functional, which silently disables
      // the whole tenant-isolation contract.
      const message = `TENANT_ENFORCEMENT=${mode} is forbidden in production — refusing to boot. Set TENANT_ENFORCEMENT=strict.`;
      this.logger.error(message);
      throw new Error(message);
    }
    if (mode !== 'strict' && env !== 'development' && env !== 'test') {
      this.logger.warn(
        `TENANT_ENFORCEMENT=${mode} — only 'strict' is supported outside development.`,
      );
    }
  }
}
