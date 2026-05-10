import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationsFilterBar } from '@/features/organizations/list-organizations/organizations-filter-bar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('OrganizationsFilterBar', () => {
  const defaultProps = {
    search: '',
    onSearchChange: vi.fn(),
    suspended: 'all' as const,
    onSuspendedChange: vi.fn(),
    status: 'all' as const,
    onStatusChange: vi.fn(),
    verticalId: '',
    onVerticalIdChange: vi.fn(),
    planId: '',
    onPlanIdChange: vi.fn(),
    onReset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input', () => {
    render(<OrganizationsFilterBar {...defaultProps} />);

    expect(screen.getByPlaceholderText(/org_/i)).toBeInTheDocument();
  });

  it('calls onSearchChange when typing in search', () => {
    render(<OrganizationsFilterBar {...defaultProps} />);

    const input = screen.getByPlaceholderText(/org_/i);
    fireEvent.change(input, { target: { value: 'clinic' } });

    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('clinic');
  });

  it('renders suspended filter select', () => {
    render(<OrganizationsFilterBar {...defaultProps} />);

    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
  });

  it('renders status filter select', () => {
    render(<OrganizationsFilterBar {...defaultProps} />);

    expect(screen.getByText(/status/i)).toBeInTheDocument();
  });

  it('calls onReset when reset button clicked', () => {
    render(<OrganizationsFilterBar {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));

    expect(defaultProps.onReset).toHaveBeenCalled();
  });
});
