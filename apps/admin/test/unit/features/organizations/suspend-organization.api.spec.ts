import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock('@deqah/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deqah/api-client')>();
  return {
    ...actual,
    apiRequest: mockApiRequest,
    ApiError: actual.ApiError,
  };
});

describe('suspend-organization.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL containing organizationId', async () => {
    const { suspendOrganization } = await import('@/features/organizations/suspend-organization/suspend-organization.api');
    mockApiRequest.mockResolvedValue(undefined);

    await suspendOrganization({ organizationId: 'org-55' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/organizations/org-55/suspend', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('returns void', async () => {
    const { suspendOrganization } = await import('@/features/organizations/suspend-organization/suspend-organization.api');
    mockApiRequest.mockResolvedValue(undefined);

    const result = await suspendOrganization({ organizationId: '1' });

    expect(result).toBeUndefined();
  });
});
