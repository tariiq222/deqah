import { describe, expect, it, vi } from 'vitest';
import { useListSubscriptions, subscriptionsListKey } from '@/features/billing/list-subscriptions/use-list-subscriptions';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: undefined,
    isLoading: true,
    error: null,
  })),
}));

describe('useListSubscriptions', () => {
  it('exports correct subscriptionsListKey function', () => {
    const params = { page: 1, perPage: 20, status: 'ACTIVE' as const, planId: 'plan-1' };
    const key = subscriptionsListKey(params);

    expect(key).toEqual(['billing', 'subscriptions', 'list', 1, 'ACTIVE', 'plan-1']);
  });

  it('subscriptionsListKey handles empty optional params', () => {
    const params = { page: 1, perPage: 20 };
    const key = subscriptionsListKey(params);

    expect(key).toContain('billing');
    expect(key).toContain('subscriptions');
    expect(key).toContain(1);
  });
});
