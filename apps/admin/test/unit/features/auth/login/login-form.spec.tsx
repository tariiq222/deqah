import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/features/auth/login/login-form';
import type { LoginResponse } from '@/features/auth/login/login.api';

const mockLogin = vi.hoisted(() => vi.fn());

vi.mock('@/features/auth/login/login.api', () => ({
  login: mockLogin,
  isAuthResponse: (res: { accessToken?: unknown }) => 'accessToken' in res,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@hcaptcha/react-hcaptcha', () => ({
  default: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react');
vi.mock('@/features/auth/login/captcha-field', () => ({
  CaptchaField: function MockCaptchaField({ onVerify }: { onVerify: (token: string) => void }) {
    React.useEffect(() => { onVerify('dev-bypass'); }, [onVerify]);
    return React.createElement('div', null, 'Dev mode — captcha skipped');
  },
}));

const loginMessages = {
  title: 'Deqah Super-admin',
  description: 'Platform staff only. Sign in with your Deqah account.',
  email: 'Email',
  password: 'Password',
  submit: 'Sign in',
  submitting: 'Signing in…',
  captchaDevMode: 'Dev mode — captcha skipped',
  error: {
    notAuthorized: 'This account is not authorized for the super-admin panel.',
    noToken: 'Login succeeded but no access token was returned.',
    failed: 'Sign-in failed',
  },
};

const forgotPasswordMessages = {
  linkLabel: 'Forgot password?',
};

function renderLoginForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const messages = {
    login: loginMessages,
    forgotPassword: forgotPasswordMessages,
  };

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <LoginForm />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('LoginForm', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockReset();
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>);
  });

  it('renders email and password fields', () => {
    renderLoginForm();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders Sign in button', () => {
    renderLoginForm();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('button is enabled after captcha auto-verifies in dev mode', () => {
    renderLoginForm();
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('shows captcha dev mode placeholder when no real sitekey is configured', () => {
    renderLoginForm();
    expect(screen.getByText('Dev mode — captcha skipped')).toBeInTheDocument();
  });

  it('forgot password link is present', () => {
    renderLoginForm();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('successful super-admin login stores token and redirects', async () => {
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);

    mockLogin.mockResolvedValueOnce({
      user: { id: 'u-1', isSuperAdmin: true },
      accessToken: 'admin-jwt-token',
    } as LoginResponse);

    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'admin@deqah.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'admin@deqah.com',
        password: 'password123',
        hCaptchaToken: 'dev-bypass',
      });
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/');
    });
  });

  it('shows error when user is not a super-admin', async () => {
    const { toast } = await import('sonner');
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);

    mockLogin.mockResolvedValueOnce({
      user: { id: 'u-1', isSuperAdmin: false },
      accessToken: 'regular-token',
    } as LoginResponse);

    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'user@clinic.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'This account is not authorized for the super-admin panel.',
      );
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows error when accessToken is missing', async () => {
    const { toast } = await import('sonner');
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);

    mockLogin.mockResolvedValueOnce({
      user: { id: 'u-1', isSuperAdmin: true },
      accessToken: '',
    } as LoginResponse);

    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'admin@deqah.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Login succeeded but no access token was returned.',
      );
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows generic error on API exception', async () => {
    const { toast } = await import('sonner');
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);

    mockLogin.mockRejectedValueOnce(new Error('network_error'));

    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'admin@deqah.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Sign-in failed');
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('redirects to next param after successful login', async () => {
    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('next=/organizations') as ReturnType<typeof useSearchParams>);

    mockLogin.mockResolvedValueOnce({
      user: { id: 'u-1', isSuperAdmin: true },
      accessToken: 'admin-jwt',
    } as LoginResponse);

    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'admin@deqah.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/organizations');
    });
  });

  it('button is disabled while submitting', async () => {
    let resolveLogin: (value: LoginResponse) => void;
    mockLogin.mockImplementationOnce(
      () => new Promise<LoginResponse>((resolve) => { resolveLogin = resolve; }),
    );

    const pushMock = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: pushMock } as unknown as ReturnType<typeof useRouter>);

    renderLoginForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'admin@deqah.com');
    await user.type(screen.getByLabelText('Password'), 'password123');

    const button = screen.getByRole('button', { name: 'Sign in' });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Signing in…');

    resolveLogin!({ user: { id: 'u-1', isSuperAdmin: true }, accessToken: 'token', refreshToken: '', expiresIn: 3600 } as LoginResponse);
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
