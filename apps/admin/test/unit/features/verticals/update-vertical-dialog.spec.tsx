import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import enMessages from '@/messages/en.json';
import { UpdateVerticalDialog } from '@/features/verticals/update-vertical/update-vertical-dialog';
import type { VerticalRow } from '@/features/verticals/types';

const mockUseUpdateVertical = vi.hoisted(() => vi.fn(() => ({
  mutate: vi.fn(),
  isPending: false,
})));

vi.mock('@/features/verticals/update-vertical/use-update-vertical', () => ({
  useUpdateVertical: mockUseUpdateVertical,
}));

vi.mock('@deqah/ui/primitives/select', () => ({
  Select: function({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (v: string) => void }) {
    return (
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-label="Template family"
      >
        {children}
      </select>
    );
  },
  SelectTrigger: function({ children }: { children: React.ReactNode }) { return <>{children}</>; },
  SelectValue: function({ placeholder }: { placeholder?: string }) { return <option value="">{placeholder}</option>; },
  SelectContent: function({ children }: { children: React.ReactNode }) { return <>{children}</>; },
  SelectItem: function({ children, value }: { children: React.ReactNode; value: string }) {
    return <option value={value}>{children}</option>;
  },
}));

const mockVertical: VerticalRow = {
  id: 'vertical-1',
  slug: 'general-medicine',
  nameAr: 'الطب العام',
  nameEn: 'General Medicine',
  templateFamily: 'MEDICAL',
  descriptionAr: null,
  descriptionEn: null,
  iconUrl: null,
  isActive: true,
  sortOrder: 1,
  createdAt: '2024-01-01',
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('UpdateVerticalDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateVertical.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('renders dialog when open', async () => {
    const onOpenChange = vi.fn();

    wrap(
      <UpdateVerticalDialog open={true} onOpenChange={onOpenChange} vertical={mockVertical} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Edit vertical/i)).toBeInTheDocument();
    });
  });

  it('does not render dialog when closed', async () => {
    const onOpenChange = vi.fn();

    wrap(
      <UpdateVerticalDialog open={false} onOpenChange={onOpenChange} vertical={mockVertical} />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Edit vertical/i)).not.toBeInTheDocument();
    });
  });

  it('renders form with vertical data', async () => {
    const onOpenChange = vi.fn();

    wrap(
      <UpdateVerticalDialog open={true} onOpenChange={onOpenChange} vertical={mockVertical} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Name \(Arabic\)/i)).toHaveValue('الطب العام');
      expect(screen.getByLabelText(/Name \(English\)/i)).toHaveValue('General Medicine');
    });
  });

  it('enables submit when form is valid', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    wrap(
      <UpdateVerticalDialog open={true} onOpenChange={onOpenChange} vertical={mockVertical} />,
    );

    await waitFor(async () => {
      await user.clear(screen.getByLabelText(/Name \(Arabic\)/i));
      await user.type(screen.getByLabelText(/Name \(Arabic\)/i), 'طب القلب');
      await user.clear(screen.getByLabelText(/Name \(English\)/i));
      await user.type(screen.getByLabelText(/Name \(English\)/i), 'Cardiology');
    });

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /save changes/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    wrap(
      <UpdateVerticalDialog open={true} onOpenChange={onOpenChange} vertical={mockVertical} />,
    );

    await waitFor(async () => {
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
