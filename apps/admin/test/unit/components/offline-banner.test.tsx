import { screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OfflineBanner } from '@/components/offline-banner';
import { renderWithProviders } from '../../test-utils';

describe('OfflineBanner', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');

  function setOnline(value: boolean) {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => value,
    });
  }

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine);
    }
  });

  it('renders nothing when online', () => {
    setOnline(true);
    const { container } = renderWithProviders(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when offline', () => {
    setOnline(false);
    renderWithProviders(<OfflineBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('shows banner when offline event fires', () => {
    setOnline(true);
    renderWithProviders(<OfflineBanner />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('hides banner when online event fires after being offline', () => {
    setOnline(false);
    renderWithProviders(<OfflineBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
