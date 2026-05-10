import { ApiError } from '@deqah/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiRequest = vi.hoisted(() => vi.fn());

vi.mock('@deqah/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deqah/api-client')>();
  return {
    ...actual,
    initClient: vi.fn(),
    apiRequest: mockApiRequest,
    ApiError: actual.ApiError,
  };
});

describe('api-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('adminRequest', () => {
    it('prepends /admin to the path and delegates to apiRequest', async () => {
      const { adminRequest } = await import('@/lib/api-client');
      mockApiRequest.mockResolvedValue({ id: '1' });

      const result = await adminRequest('/organizations', { method: 'GET' });

      expect(mockApiRequest).toHaveBeenCalledWith('/admin/organizations', { method: 'GET' });
      expect(result).toEqual({ id: '1' });
    });

    it('constructs correct URL with query string path', async () => {
      const { adminRequest } = await import('@/lib/api-client');
      mockApiRequest.mockResolvedValue([]);

      await adminRequest('/users?search=foo&page=1');

      expect(mockApiRequest).toHaveBeenCalledWith('/admin/users?search=foo&page=1', {});
    });

    it('passes through custom headers in init', async () => {
      const { adminRequest } = await import('@/lib/api-client');
      mockApiRequest.mockResolvedValue(null);
      const headers = { 'X-Request-Id': 'abc-123' };

      await adminRequest('/foo', { headers } as RequestInit);

      expect(mockApiRequest).toHaveBeenCalledWith('/admin/foo', { headers });
    });

    it('returns typed result from apiRequest', async () => {
      const { adminRequest } = await import('@/lib/api-client');
      const org = { id: 'org-1', slug: 'test-clinic', nameAr: 'اختبار', nameEn: 'Test' };
      mockApiRequest.mockResolvedValue(org);

      const result = await adminRequest<typeof org>('/orgs/org-1');

      expect(result).toEqual(org);
    });
  });

  describe('publicRequest', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);
      vi.stubGlobal('Headers', class MockHeaders {
        private data: Record<string, string> = {};
        constructor(init?: Record<string, string>) {
          if (init) {
            Object.assign(this.data, init);
          }
        }
        get(name: string) { return this.data[name] ?? null; }
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('uses full /api/proxy prefix without /admin', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { foo: 'bar' } }),
      } as unknown as Response);

      await publicRequest('/auth/login', { method: 'POST' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/auth/login',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sets Content-Type header via Headers constructor', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: null }),
      } as unknown as Response);

      await publicRequest('/foo');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/foo',
        expect.objectContaining({
          credentials: 'include',
        }),
      );
      const call = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = call[1].headers as unknown as { data: Record<string, string> };
      expect(headers.data['Content-Type']).toBe('application/json');
    });

    it('does NOT attach Authorization header (bypasses token getter)', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: null }),
      } as unknown as Response);

      await publicRequest('/public/data');

      const call = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = call[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('returns undefined for 204 No Content', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      } as unknown as Response);

      const result = await publicRequest('/noop');

      expect(result).toBeUndefined();
    });

    it('unwraps { success: true, data } response', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      const payload = { userId: 'u-1', token: 'abc' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: payload }),
      } as unknown as Response);

      const result = await publicRequest<typeof payload>('/auth/token');

      expect(result).toEqual(payload);
    });

    it('returns raw JSON when success wrapper is absent', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      const raw = { items: [1, 2, 3], total: 3 };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => raw,
      } as unknown as Response);

      const result = await publicRequest<typeof raw>('/search');

      expect(result).toEqual(raw);
    });

    it('throws ApiError on non-ok response', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'invalid_email', error: 'ValidationError' }),
      } as unknown as Response);

      await expect(publicRequest('/auth/login')).rejects.toThrow(ApiError);
    });

    it('ApiError carries status and message from response body', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'invalid_credentials' }),
      } as unknown as Response);

      await expect(publicRequest('/auth/login')).rejects.toMatchObject({
        status: 401,
        message: 'invalid_credentials',
      });
    });

    it('uses statusText when body.message is absent', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      } as unknown as Response);

      await expect(publicRequest('/boom')).rejects.toMatchObject({
        status: 500,
        message: 'Internal Server Error',
      });
    });

    it('passes credentials: include for cookie-based auth', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: null }),
      } as unknown as Response);

      await publicRequest('/auth/refresh');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/auth/refresh',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    it('merges custom headers with Content-Type', async () => {
      const { publicRequest } = await import('@/lib/api-client');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: null }),
      } as unknown as Response);

      await publicRequest('/foo', { headers: { 'X-Custom': 'header' } } as RequestInit);

      const call = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = call[1].headers as unknown as { data: Record<string, string> };
      expect(headers.data['X-Custom']).toBe('header');
      expect(headers.data['Content-Type']).toBe('application/json');
    });
  });

  describe('ApiError export', () => {
    it('ApiError is exported from the module', async () => {
      const { ApiError } = await import('@/lib/api-client');
      expect(ApiError).toBe(ApiError);
    });

    it('ApiError instance has status, message, body, code', () => {
      const err = new ApiError(403, 'forbidden', { detail: 'no access' }, 'FORBIDDEN');
      expect(err.status).toBe(403);
      expect(err.message).toBe('forbidden');
      expect(err.body).toEqual({ detail: 'no access' });
      expect(err.code).toBe('FORBIDDEN');
    });

    it('ApiError defaults code to UNKNOWN', () => {
      const err = new ApiError(500, 'server error', null);
      expect(err.code).toBe('UNKNOWN');
    });
  });
});
