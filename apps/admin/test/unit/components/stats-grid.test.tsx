import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsGrid, type StatsGridStat } from '@/components/stats-grid';

const stats: StatsGridStat[] = [
  { label: 'Total', value: 42, variant: 'primary' },
  { label: 'Active', value: 30, variant: 'success' },
  { label: 'Inactive', value: 10, variant: 'warning' },
  { label: 'New', value: 2, variant: 'accent' },
];

describe('StatsGrid', () => {
  it('renders all stat cards', () => {
    render(<StatsGrid stats={stats} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('displays stat values', () => {
    render(<StatsGrid stats={stats} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders skeleton when isLoading is true', () => {
    const { container } = render(<StatsGrid stats={stats} isLoading={true} />);
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBe(4);
  });

  it('renders a single stat', () => {
    render(<StatsGrid stats={[{ label: 'Count', value: 1, variant: 'primary' }]} />);
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
