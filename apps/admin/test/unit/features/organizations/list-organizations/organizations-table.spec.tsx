import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationsTable } from '@/features/organizations/list-organizations/organizations-table';
import type { OrganizationRow } from '@/features/organizations/types';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

const mockOrg: OrganizationRow = {
  id: 'org-1',
  slug: 'test-clinic',
  nameAr: 'عيادة الاختبار',
  nameEn: 'Test Clinic',
  status: 'ACTIVE',
  createdAt: '2024-01-15T10:00:00Z',
  verticalId: null,
  trialEndsAt: null,
  suspendedAt: null,
  suspendedReason: null,
  subscription: {
    status: 'ACTIVE',
    plan: {
      slug: 'basic',
      nameEn: 'Basic',
    },
  },
  owner: { name: 'أحمد علي', email: 'ahmed@example.com' },
};

describe('OrganizationsTable', () => {
  it('renders organization rows correctly', () => {
    render(<OrganizationsTable items={[mockOrg]} isLoading={false} />);

    expect(screen.getByText('test-clinic')).toBeInTheDocument();
    expect(screen.getByText('عيادة الاختبار')).toBeInTheDocument();
    expect(screen.getByText('Test Clinic')).toBeInTheDocument();
    expect(screen.getByText('basic')).toBeInTheDocument();
  });

  it('renders open button link to organization detail', () => {
    render(<OrganizationsTable items={[mockOrg]} isLoading={false} />);

    const openButton = screen.getByRole('link', { name: /open/i });
    expect(openButton).toHaveAttribute('href', '/organizations/org-1');
  });

  it('shows empty state when no items', () => {
    render(<OrganizationsTable items={[]} isLoading={false} />);

    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<OrganizationsTable items={[mockOrg]} isLoading={false} />);

    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('shows noPlan when subscription is null', () => {
    const orgWithoutPlan: OrganizationRow = {
      ...mockOrg,
      subscription: null,
    };
    render(<OrganizationsTable items={[orgWithoutPlan]} isLoading={false} />);

    expect(screen.getByText('noPlan')).toBeInTheDocument();
  });
});
