import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import enMessages from '@/messages/en.json';
import { BrandingForm } from '@/features/platform-branding/branding-form';

const mockGetPlatformBrand = vi.hoisted(() => vi.fn());
const mockUpdatePlatformBrand = vi.hoisted(() => vi.fn());

vi.mock('@/features/platform-branding/platform-branding.api', () => ({
  getPlatformBrand: mockGetPlatformBrand,
  updatePlatformBrand: mockUpdatePlatformBrand,
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const defaultBrand = {
  logoUrl: '',
  primaryColor: '#354FD8',
  accentColor: '#82CC17',
  locale: {
    default: 'ar',
    rtlDefault: true,
    dateFormat: 'dd/MM/yyyy',
    currencyFormat: 'SAR',
  },
};

describe('BrandingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlatformBrand.mockResolvedValue(defaultBrand);
    mockUpdatePlatformBrand.mockResolvedValue(undefined);
  });

  it('renders error state when load fails', async () => {
    mockGetPlatformBrand.mockRejectedValue(new Error('Load failed'));

    wrap(<BrandingForm />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load branding settings/i)).toBeInTheDocument();
    });
  });

  it('renders form with default values when loaded', async () => {
    wrap(<BrandingForm />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Logo URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Primary Color/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Accent Color/i)).toBeInTheDocument();
    });
  });

  it('updates logo URL field', async () => {
    const user = userEvent.setup();

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const logoInput = screen.getByLabelText(/Logo URL/i);
      await user.clear(logoInput);
      await user.type(logoInput, 'https://example.com/logo.svg');
      expect(logoInput).toHaveValue('https://example.com/logo.svg');
    });
  });

  it('updates locale default field', async () => {
    const user = userEvent.setup();

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const localeInput = screen.getByLabelText(/Default Locale/i);
      await user.clear(localeInput);
      await user.type(localeInput, 'en');
      expect(localeInput).toHaveValue('en');
    });
  });

  it('updates currency format field', async () => {
    const user = userEvent.setup();

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const currencyInput = screen.getByLabelText(/Currency Format/i);
      await user.clear(currencyInput);
      await user.type(currencyInput, 'USD');
      expect(currencyInput).toHaveValue('USD');
    });
  });

  it('updates date format field', async () => {
    const user = userEvent.setup();

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const dateInput = screen.getByLabelText(/Date Format/i);
      await user.clear(dateInput);
      await user.type(dateInput, 'MM/dd/yyyy');
      expect(dateInput).toHaveValue('MM/dd/yyyy');
    });
  });

  it('toggles RTL default checkbox', async () => {
    const user = userEvent.setup();

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const rtlCheckbox = screen.getByLabelText(/RTL by default/i);
      await user.click(rtlCheckbox);
      expect(rtlCheckbox).not.toBeChecked();
    });
  });

  it('saves branding settings successfully', async () => {
    const user = userEvent.setup();

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const saveButton = screen.getByRole('button', { name: /save branding settings/i });
      await user.click(saveButton);
    });

    await waitFor(() => {
      expect(mockUpdatePlatformBrand).toHaveBeenCalled();
    });
  });

  it('shows error message when save fails', async () => {
    const user = userEvent.setup();
    mockUpdatePlatformBrand.mockRejectedValue(new Error('Save failed'));

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const saveButton = screen.getByRole('button', { name: /save branding settings/i });
      await user.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
    });
  });

  it('disables save button while saving', async () => {
    const user = userEvent.setup();
    mockUpdatePlatformBrand.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 100)),
    );

    wrap(<BrandingForm />);

    await waitFor(async () => {
      const saveButton = screen.getByRole('button', { name: /save branding settings/i });
      await user.click(saveButton);
      expect(saveButton).toBeDisabled();
    });
  });
});
