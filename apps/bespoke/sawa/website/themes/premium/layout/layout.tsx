import Link from 'next/link';
import { getLocale, LanguageSwitcher } from '@/features/locale/public';
import { t } from '@/features/locale/dictionary';
import { getPublicBrandingForSsr } from '@/features/branding/public';
import type { ThemeLayoutProps } from '../../types';

export async function PremiumLayout({ children }: ThemeLayoutProps) {
  const locale = await getLocale();
  const branding = await getPublicBrandingForSsr();
  const brandName = branding.organizationNameAr || branding.organizationNameEn || 'دِقة';
  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#f5f5f5',
      }}
    >
      <header
        style={{
          padding: '1.5rem 3rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'rgba(10,10,10,0.8)',
          backdropFilter: 'blur(16px)',
          zIndex: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span style={{ letterSpacing: '0.12em', fontSize: '0.75rem' }}>{brandName}</span>
        <nav style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', alignItems: 'center' }}>
          <Link href="/" style={{ color: '#f5f5f5' }}>{t(locale, 'nav.home')}</Link>
          <Link href="/therapists" style={{ color: '#f5f5f5' }}>{t(locale, 'nav.therapists')}</Link>
          <Link href="/burnout-test" style={{ color: '#f5f5f5' }}>{t(locale, 'nav.burnout')}</Link>
          <Link href="/contact" style={{ color: '#f5f5f5' }}>{t(locale, 'nav.contact')}</Link>
          <LanguageSwitcher current={locale} />
        </nav>
      </header>
      {children}
      <footer
        style={{
          padding: '3rem',
          textAlign: 'center',
          opacity: 0.4,
          fontSize: '0.75rem',
          letterSpacing: '0.2em',
        }}
      >
        PREMIUM · {brandName}
      </footer>
    </div>
  );
}
