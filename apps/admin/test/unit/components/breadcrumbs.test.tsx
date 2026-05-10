import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { renderWithProviders } from '../../test-utils';

vi.mock('next/link', () => ({
  default: function MockLink({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

describe('Breadcrumbs', () => {
  it('renders known root route', () => {
    renderWithProviders(<Breadcrumbs pathname="/" />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('renders multi-segment trail with links', () => {
    renderWithProviders(<Breadcrumbs pathname="/organizations" />);
    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveAttribute('href', '/');
    expect(screen.getByText('Organizations')).toBeInTheDocument();
  });

  it('matches dynamic segment /organizations/:id', () => {
    renderWithProviders(<Breadcrumbs pathname="/organizations/abc123" />);
    expect(screen.getByRole('link', { name: 'Organizations' })).toBeInTheDocument();
    expect(screen.getByText('Detail')).toBeInTheDocument();
  });

  it('matches nested dynamic segment /plans/:id/edit', () => {
    renderWithProviders(<Breadcrumbs pathname="/plans/xyz/edit" />);
    expect(screen.getByRole('link', { name: 'Plans' })).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('returns null for unknown routes', () => {
    const { container } = renderWithProviders(<Breadcrumbs pathname="/unknown/route/xyz" />);
    expect(container.firstChild).toBeNull();
  });
});
