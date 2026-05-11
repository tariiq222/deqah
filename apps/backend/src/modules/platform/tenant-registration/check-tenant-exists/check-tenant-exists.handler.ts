import { Injectable } from '@nestjs/common';
import { SubdomainResolverService } from '../../../../common/tenant/subdomain-resolver.service';

export interface CheckTenantExistsResult {
  exists: boolean;
  organizationId?: string;
}

@Injectable()
export class CheckTenantExistsHandler {
  constructor(private readonly subdomainResolver: SubdomainResolverService) {}

  /**
   * Resolves tenant existence from a Host header value.
   * Never throws — returns { exists: false } for any unresolvable input.
   */
  async execute(
    host: string | undefined | null,
  ): Promise<CheckTenantExistsResult> {
    try {
      const organizationId = await this.subdomainResolver.resolve(host);
      if (organizationId) {
        return { exists: true, organizationId };
      }
      return { exists: false };
    } catch {
      return { exists: false };
    }
  }
}
