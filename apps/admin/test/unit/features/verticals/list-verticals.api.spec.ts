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

describe('list-verticals.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls adminRequest with default page/perPage params', async () => {
    const { listVerticals } = await import('@/features/verticals/list-verticals/list-verticals.api');
    const mockResponse = { items: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } };
    mockApiRequest.mockResolvedValue(mockResponse);

    await listVerticals();

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit?];
    expect(call[0]).toContain('/admin/verticals');
    expect(call[0]).toContain('page=1');
    expect(call[0]).toContain('perPage=20');
  });

  it('uses GET method (default)', async () => {
    const { listVerticals } = await import('@/features/verticals/list-verticals/list-verticals.api');
    const mockResponse = { items: [], meta: { page: 1, perPage: 20, total: 0, totalPages: 1 } };
    mockApiRequest.mockResolvedValue(mockResponse);

    await listVerticals();

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit?];
    expect(call[1]).toEqual({});
  });

  it('returns paginated response with items and meta', async () => {
    const { listVerticals } = await import('@/features/verticals/list-verticals/list-verticals.api');
    const mockVerticals = [{ id: '1', slug: 'medical', nameEn: 'Medical' }];
    const mockResponse = {
      items: mockVerticals,
      meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
    };
    mockApiRequest.mockResolvedValue(mockResponse);

    const result = await listVerticals();

    expect(result.items[0].slug).toBe('medical');
    expect(result.meta.total).toBe(1);
  });

  it('passes custom page and perPage in URL', async () => {
    const { listVerticals } = await import('@/features/verticals/list-verticals/list-verticals.api');
    mockApiRequest.mockResolvedValue({ items: [], meta: { page: 2, perPage: 10, total: 0, totalPages: 1 } });

    await listVerticals(2, 10);

    const call = mockApiRequest.mock.calls[0] as [string, RequestInit?];
    expect(call[0]).toContain('page=2');
    expect(call[0]).toContain('perPage=10');
  });
});
