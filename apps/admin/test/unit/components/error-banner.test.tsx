import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from '@/components/error-banner';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';

describe('ErrorBanner', () => {
  it('renders error message from Error instance', () => {
    render(<ErrorBanner error={new Error('Something went wrong')} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders error message from string', () => {
    render(<ErrorBanner error="Network timeout" />);
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });

  it('renders fallback for unknown error type', () => {
    render(<ErrorBanner error={{ code: 500 }} />);
    expect(screen.getByText('Unknown error')).toBeInTheDocument();
  });

  it('calls Sentry.captureException when error is an Error', () => {
    const err = new Error('Sentry test');
    render(<ErrorBanner error={err} context="page:test" />);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { context: 'page:test' },
    });
  });

  it('calls onRetry when Retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorBanner error={new Error('Fail')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorBanner error="no retry" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
