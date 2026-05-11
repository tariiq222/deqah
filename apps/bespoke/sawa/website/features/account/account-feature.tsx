'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/features/locale/locale';
import { t } from '@/features/locale/dictionary';
import { useCurrentClient, clearAuth, clientLogoutApi } from '@/features/auth/public';
import { ClientBookingsList } from '@/features/auth/client-bookings-list';

interface AccountFeatureProps {
  locale: Locale;
}

export function AccountFeature({ locale }: AccountFeatureProps) {
  const { client, isLoading, error } = useCurrentClient();
  const router = useRouter();

  async function handleLogout() {
    try {
      await clientLogoutApi();
    } finally {
      clearAuth();
      router.push('/login');
    }
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.6 }}>
        Loading...
      </div>
    );
  }

  if (error || client === null) {
    router.push('/login');
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div
        style={{
          padding: '1.5rem',
          borderRadius: '12px',
          background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
          backdropFilter: 'blur(12px)',
          border: '1px solid color-mix(in srgb, var(--primary) 12%, transparent)',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--primary-dark)' }}>
          {t(locale, 'account.profile')}
        </h2>
        <ProfileSection client={client} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary-dark)' }}>
            {t(locale, 'account.bookings')}
          </h2>
          <Link href="/account/bookings" style={{ fontSize: '0.875rem', color: 'var(--primary)', fontWeight: 500 }}>
            View all
          </Link>
        </div>
        <ClientBookingsList locale={locale} />
      </div>

      <button
        onClick={handleLogout}
        style={{
          padding: '0.75rem',
          borderRadius: '8px',
          background: 'color-mix(in srgb, var(--error) 10%, transparent)',
          color: 'var(--error)',
          border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '0.9375rem',
        }}
      >
        {t(locale, 'nav.logout')}
      </button>
    </div>
  );
}

function ProfileSection({ client }: { client: { name: string; email: string | null; phone: string | null; emailVerified: boolean; phoneVerified: boolean } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <ProfileRow label="Name" value={client.name} />
      <ProfileRow label="Email" value={client.email ?? '—'} />
      <ProfileRow label="Phone" value={client.phone ?? '—'} />
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
        {client.emailVerified && <VerificationBadge label="Email Verified" color="success" />}
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function VerificationBadge({ label, color }: { label: string; color: 'success' | 'warning' }) {
  const colorMap = { success: 'var(--success)', warning: 'var(--warning)' };
  return (
    <span
      style={{
        padding: '0.2rem 0.6rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: `color-mix(in srgb, ${colorMap[color]} 15%, transparent)`,
        color: colorMap[color],
        border: `1px solid color-mix(in srgb, ${colorMap[color]} 30%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
