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

describe('archive-organization.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with POST and correct URL', async () => {
    const { archiveOrganization } = await import('@/features/organizations/archive-organization/archive-organization.api');
    mockApiRequest.mockResolvedValue(undefined);

    await archiveOrganization({ organizationId: 'org-7' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/organizations/org-7/archive', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('returns void', async () => {
    const { archiveOrganization } = await import('@/features/organizations/archive-organization/archive-organization.api');
    mockApiRequest.mockResolvedValue(undefined);

    const result = await archiveOrganization({ organizationId: '1' });

    expect(result).toBeUndefined();
  });
});
