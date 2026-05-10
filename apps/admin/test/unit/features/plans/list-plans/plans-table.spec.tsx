import { screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlansTable } from '@/features/plans/list-plans/plans-table';
import type { PlanRow } from '@/features/plans/types';
import { renderWithProviders } from '../../../../test-utils';

const mockPlan: PlanRow = {
  id: 'plan-1',
  slug: 'basic',
  nameAr: 'الأساسية',
  nameEn: 'Basic',
  priceMonthly: 99.00,
  priceAnnual: 990.00,
  currency: 'USD',
  isActive: true,
  isVisible: true,
  sortOrder: 1,
  limits: {},
  createdAt: '2024-01-01T00:00:00Z',
  _count: { subscriptions: 5 },
};

const mockPlanInactive: PlanRow = {
  id: 'plan-2',
  slug: 'premium',
  nameAr: 'المميزة',
  nameEn: 'Premium',
  priceMonthly: 199.00,
  priceAnnual: 1990.00,
  currency: 'USD',
  isActive: false,
  isVisible: true,
  sortOrder: 2,
  limits: {},
  createdAt: '2024-01-01T00:00:00Z',
  _count: { subscriptions: 0 },
};

describe('PlansTable', () => {
  const defaultProps = {
    items: [mockPlan, mockPlanInactive],
    isLoading: false,
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders plan rows correctly', () => {
    renderWithProviders(<PlansTable {...defaultProps} />);

    expect(screen.getByText('basic')).toBeInTheDocument();
    expect(screen.getByText('الأساسية')).toBeInTheDocument();
    expect(screen.getByText('Basic')).toBeInTheDocument();
  });

  it('renders subscriber count badge for active plan', () => {
    renderWithProviders(<PlansTable {...defaultProps} />);

    expect(screen.getByTitle('5 active subscribers')).toBeInTheDocument();
  });

  it('renders Edit and Delete action buttons', () => {
    renderWithProviders(<PlansTable {...defaultProps} />);

    const editButtons = screen.getAllByRole('link', { name: /edit/i });
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });

    expect(editButtons.length).toBe(2);
    expect(deleteButtons.length).toBe(2);
  });

  it('calls onDelete with correct plan when delete clicked', () => {
    renderWithProviders(<PlansTable {...defaultProps} />);

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    fireEvent.click(deleteButtons[0]);

    expect(defaultProps.onDelete).toHaveBeenCalledWith(mockPlan);
  });

  it('shows empty state when no plans', () => {
    renderWithProviders(<PlansTable {...defaultProps} items={[]} />);

    expect(screen.getByText(/no plans defined/i)).toBeInTheDocument();
  });

  it('renders Active badge for active plan', () => {
    renderWithProviders(<PlansTable {...defaultProps} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Inactive badge for inactive plan', () => {
    renderWithProviders(<PlansTable {...defaultProps} />);

    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});
