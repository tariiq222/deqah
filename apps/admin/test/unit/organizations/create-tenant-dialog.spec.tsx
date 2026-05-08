import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTenantDialog } from '@/features/organizations/create-tenant/create-tenant-dialog';
import { adminRequest } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({ adminRequest: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/features/verticals/list-verticals/use-list-verticals', () => ({
  useListVerticals: () => ({
    data: {
      items: [{ slug: 'general', nameAr: 'عام', nameEn: 'General', isActive: true }],
      meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
    },
  }),
}));

vi.mock('@/features/plans/list-plans/use-list-plans', () => ({
  useListPlans: () => ({
    data: [{ id: 'plan-uuid-1', slug: 'basic', nameAr: 'الأساسية', isActive: true }],
  }),
}));

vi.mock('@/features/users/search-users/use-search-users', () => ({
  useSearchUsers: () => ({
    data: {
      items: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Test User', email: 'test@example.com' }],
      meta: { total: 1, page: 1, perPage: 10, totalPages: 1 },
    },
    isFetching: false,
  }),
}));

const messages = {
  organizations: {
    create: {
      button: 'Create tenant',
      title: 'Create tenant',
      description: 'Create an organization, owner membership, and tenant defaults.',
      step1: 'Owner',
      step2: 'Organization',
      step3: 'Plan & Billing',
      step4: 'Review',
      slug: 'Slug',
      slugPlaceholder: 'riyadh-clinic',
      nameAr: 'Arabic name',
      nameEn: 'English name',
      ownerUserId: 'Owner user ID',
      ownerModeExisting: 'Existing user',
      ownerModeNew: 'New user',
      ownerName: 'Full name',
      ownerEmail: 'Email address',
      ownerPhone: 'Phone (optional)',
      ownerPassword: 'Temporary password',
      ownerPasswordHint: 'Leave blank to auto-generate and email a password.',
      verticalSlug: 'Vertical slug',
      planId: 'Plan ID',
      billingCycle: 'Billing cycle',
      monthly: 'Monthly',
      annual: 'Annual',
      trialDays: 'Trial days',
      editStep: 'Edit',
      reviewOwner: 'Owner',
      reviewOrg: 'Organization',
      reviewPlan: 'Plan & Billing',
      noPlan: 'No plan selected',
      noVertical: 'No vertical selected',
      back: 'Back',
      next: 'Next',
      cancel: 'Cancel',
      submit: 'Create tenant',
      submitting: 'Creating...',
      success: 'Tenant created.',
      errorFallback: 'Failed to create tenant',
    },
  },
};

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const onOpenChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <CreateTenantDialog open onOpenChange={onOpenChange} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { invalidateSpy, onOpenChange };
}

async function completeStep1Existing(user: ReturnType<typeof userEvent.setup>) {
  const ownerInput = screen.getByPlaceholderText('Search by email or name…');
  await user.type(ownerInput, 'test');
  const listItem = await screen.findByText('Test User');
  await user.click(listItem);
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

async function completeStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Slug'), 'riyadh-clinic');
  await user.type(screen.getByLabelText('Arabic name'), 'عيادة الرياض');
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

async function completeStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

describe('CreateTenantDialog wizard', () => {
  beforeEach(() => {
    vi.mocked(adminRequest).mockReset();
  });

  it('starts on step 1 with Next disabled until owner selected', async () => {
    renderDialog();
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    const ownerInput = screen.getByPlaceholderText('Search by email or name…');
    await user.type(ownerInput, 'test');
    const listItem = await screen.findByText('Test User');
    await user.click(listItem);

    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('navigates forward through all 4 steps', async () => {
    renderDialog();
    const user = userEvent.setup();

    expect(screen.getByText('Owner')).toBeInTheDocument();
    await completeStep1Existing(user);

    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
    await completeStep2(user);

    expect(screen.getByLabelText('Trial days')).toBeInTheDocument();
    await completeStep3(user);

    expect(screen.getByRole('button', { name: 'Create tenant' })).toBeInTheDocument();
  });

  it('Back button returns to previous step without losing data', async () => {
    renderDialog();
    const user = userEvent.setup();

    await completeStep1Existing(user);
    await user.type(screen.getByLabelText('Slug'), 'riyadh-clinic');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByPlaceholderText('Search by email or name…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Slug')).toHaveValue('riyadh-clinic');
  });

  it('Edit button on review card jumps to correct step', async () => {
    renderDialog();
    const user = userEvent.setup();

    await completeStep1Existing(user);
    await completeStep2(user);
    await completeStep3(user);

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[1]); // index 1 = Org card

    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
  });

  it('submits correct payload for existing owner (no plan)', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      id: 'org-1', slug: 'riyadh-clinic', nameAr: 'عيادة الرياض',
      nameEn: '', status: 'TRIALING', verticalId: null, trialEndsAt: null,
    });
    const { invalidateSpy, onOpenChange } = renderDialog();
    const user = userEvent.setup();

    await completeStep1Existing(user);
    await completeStep2(user);
    await completeStep3(user);

    await user.click(screen.getByRole('button', { name: 'Create tenant' }));

    await waitFor(() => {
      expect(adminRequest).toHaveBeenCalledWith('/organizations', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'riyadh-clinic',
          nameAr: 'عيادة الرياض',
          ownerUserId: '11111111-1111-4111-8111-111111111111',
          trialDays: 14,
        }),
      });
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organizations', 'list'] });
  });

  it('submits correct payload for new owner', async () => {
    vi.mocked(adminRequest).mockResolvedValue({
      id: 'org-2', slug: 'new-clinic', nameAr: 'عيادة جديدة',
      nameEn: '', status: 'TRIALING', verticalId: null, trialEndsAt: null,
    });
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'New user' }));
    await user.type(screen.getByLabelText('Full name'), 'أحمد محمد');
    await user.type(screen.getByLabelText('Email address'), 'ahmed@example.com');
    await user.type(screen.getByLabelText('Temporary password'), 'Password123!');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.type(screen.getByLabelText('Slug'), 'new-clinic');
    await user.type(screen.getByLabelText('Arabic name'), 'عيادة جديدة');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: 'Create tenant' }));

    await waitFor(() => {
      expect(adminRequest).toHaveBeenCalledWith('/organizations', {
        method: 'POST',
        body: JSON.stringify({
          slug: 'new-clinic',
          nameAr: 'عيادة جديدة',
          ownerName: 'أحمد محمد',
          ownerEmail: 'ahmed@example.com',
          ownerPassword: 'Password123!',
          trialDays: 14,
        }),
      });
    });
  });

  it('shows API error on review step without closing dialog', async () => {
    vi.mocked(adminRequest).mockRejectedValue(new Error('email_already_exists'));
    const { onOpenChange } = renderDialog();
    const user = userEvent.setup();

    await completeStep1Existing(user);
    await completeStep2(user);
    await completeStep3(user);
    await user.click(screen.getByRole('button', { name: 'Create tenant' }));

    expect(await screen.findByText('email_already_exists')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('password field is optional — form valid with empty password', async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'New user' }));
    await user.type(screen.getByLabelText('Full name'), 'أحمد محمد');
    await user.type(screen.getByLabelText('Email address'), 'ahmed@example.com');
    // do NOT fill in password

    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});
