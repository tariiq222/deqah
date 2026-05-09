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

describe('update-organization.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with PATCH and correct URL', async () => {
    const { updateOrganization } = await import('@/features/organizations/update-organization/update-organization.api');
    mockApiRequest.mockResolvedValue({ id: 'org-1' });

    await updateOrganization({ organizationId: 'org-1', nameAr: 'محدث' });

    expect(mockApiRequest).toHaveBeenCalledWith('/admin/organizations/org-1', {
      method: 'PATCH',
      body: JSON.stringify({ nameAr: 'محدث' }),
    });
  });

  it('strips organizationId from body, keeps other fields', async () => {
    const { updateOrganization } = await import('@/features/organizations/update-organization/update-organization.api');
    mockApiRequest.mockResolvedValue({ id: '1' });

    await updateOrganization({
      organizationId: 'org-99',
      nameEn: 'Updated Name',
      verticalSlug: null,
    });

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.organizationId).toBeUndefined();
    expect(body.nameEn).toBe('Updated Name');
    expect(body.verticalSlug).toBeNull();
  });

  it('returns typed OrganizationRow', async () => {
    const { updateOrganization } = await import('@/features/organizations/update-organization/update-organization.api');
    const mockRow = { id: 'org-1', nameEn: 'Updated' };
    mockApiRequest.mockResolvedValue(mockRow);

    const result = await updateOrganization({ organizationId: 'org-1' });

    expect(result.nameEn).toBe('Updated');
  });
});
