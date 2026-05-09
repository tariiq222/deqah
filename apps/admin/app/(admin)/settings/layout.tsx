import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const tb = useTranslations('breadcrumbs');
  const sh = useTranslations('settings.hub.cards');

  const TABS = [
    { href: '/settings/email', label: tb('email') },
    { href: '/settings/notifications', label: tb('notifications') },
    { href: '/settings/billing', label: tb('billing') },
    { href: '/settings/branding', label: tb('branding') },
    { href: '/settings/health', label: sh('health.title') },
    { href: '/settings/security', label: tb('security') },
  ];

  return (
    <div>
      <nav className="mb-6 flex gap-2 border-b border-border pb-2">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
