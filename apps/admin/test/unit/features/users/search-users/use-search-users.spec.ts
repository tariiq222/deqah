import { describe, expect, it, vi } from 'vitest';
import { useSearchUsers, usersSearchKey } from '@/features/users/search-users/use-search-users';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: undefined,
    isLoading: true,
    error: null,
  })),
}));

describe('useSearchUsers', () => {
  it('exports correct usersSearchKey function', () => {
    const params = { page: 1, perPage: 20, search: 'test', organizationId: 'org-1' };
    const key = usersSearchKey(params);

    expect(key).toEqual(['users', 'search', 1, 'test', 'org-1']);
  });

  it('usersSearchKey handles empty optional params', () => {
    const params = { page: 1, perPage: 20 };
    const key = usersSearchKey(params);

    expect(key).toContain(1);
    expect(key).toContain('');
  });
});
