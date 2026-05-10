import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import { adminRequest } from '@/lib/api-client';
import enMessages from '@/messages/en.json';

type Messages = Parameters<typeof NextIntlClientProvider>[0]['messages'];

export interface RenderOpts extends Omit<RenderOptions, 'wrapper'> {
  messages?: Messages;
  locale?: string;
}

export function renderWithProviders(ui: ReactElement, opts: RenderOpts = {}) {
  const { messages = enMessages as Messages, locale = 'en', ...rest } = opts;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    );
  }

  const result = render(ui, { wrapper: Wrapper, ...rest });
  return { ...result, queryClient, invalidateSpy };
}

/**
 * Convenience: spec files must still call `vi.mock('@/lib/api-client', ...)` at the top.
 * This returns the typed mock reference for use in `vi.mocked(...)` assertions.
 */
export function getAdminRequestMock() {
  return vi.mocked(adminRequest);
}
