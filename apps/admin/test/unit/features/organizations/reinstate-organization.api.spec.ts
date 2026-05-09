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

describe('reinstate-organization.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { reinstateOrganization } = await import('@/features/organizations/reinstate-organization/reinstate-organization.api');
    mockApiRequest.mockResolvedValue(undefined);

    await reinstateOrganization({ organizationId: 'org-12' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/organizations/org-12/reinstate', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('returns void', async () => {
    const { reinstateOrganization } = await import('@/features/organizations/reinstate-organization/reinstate-organization.api');
    mockApiRequest.mockResolvedValue(undefined);

    const result = await reinstateOrganization({ organizationId: '1' });

    expect(result).toBeUndefined();
  });
});
