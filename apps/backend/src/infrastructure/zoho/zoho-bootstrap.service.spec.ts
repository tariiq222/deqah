import { ZohoBootstrapService } from './zoho-bootstrap.service';
import type { ZohoApiClient } from './zoho-api.client';
import type { ConfigService } from '@nestjs/config';

const makeConfig = (overrides: Record<string, string | undefined> = {}) => {
  const map: Record<string, string | undefined> = {
    ZOHO_PLATFORM_REFRESH_TOKEN: 'rt_platform',
    ZOHO_PLATFORM_ORGANIZATION_ID: 'zoho-platform-org',
    ZOHO_PLATFORM_DC: 'sa',
    DEFAULT_ORGANIZATION_ID: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => map[key]),
  } as unknown as ConfigService;
};

const makeApi = () => ({
  setAutoGenerateInvoiceNumber: jest.fn().mockResolvedValue(undefined),
} as unknown as ZohoApiClient);

describe('ZohoBootstrapService', () => {
  it('calls setAutoGenerateInvoiceNumber(false) on platform org at boot', async () => {
    const cfg = makeConfig();
    const api = makeApi();
    const svc = new ZohoBootstrapService(cfg, api);

    await svc.onApplicationBootstrap();

    expect(api.setAutoGenerateInvoiceNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        zohoOrganizationId: 'zoho-platform-org',
        refreshToken: 'rt_platform',
        dataCenter: 'sa',
      }),
      false,
    );
  });

  it('is a no-op when ZOHO_PLATFORM_REFRESH_TOKEN is not configured', async () => {
    const cfg = makeConfig({ ZOHO_PLATFORM_REFRESH_TOKEN: undefined });
    const api = makeApi();
    const svc = new ZohoBootstrapService(cfg, api);

    await svc.onApplicationBootstrap();

    expect(api.setAutoGenerateInvoiceNumber).not.toHaveBeenCalled();
  });

  it('is a no-op when ZOHO_PLATFORM_ORGANIZATION_ID is not configured', async () => {
    const cfg = makeConfig({ ZOHO_PLATFORM_ORGANIZATION_ID: undefined });
    const api = makeApi();
    const svc = new ZohoBootstrapService(cfg, api);

    await svc.onApplicationBootstrap();

    expect(api.setAutoGenerateInvoiceNumber).not.toHaveBeenCalled();
  });

  it('logs a warning and does NOT throw when Zoho is unreachable at boot', async () => {
    const cfg = makeConfig();
    const api = makeApi();
    (api.setAutoGenerateInvoiceNumber as jest.Mock).mockRejectedValue(
      new Error('Network error'),
    );
    const svc = new ZohoBootstrapService(cfg, api);

    // Must not throw — boot must succeed even when Zoho is down.
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
