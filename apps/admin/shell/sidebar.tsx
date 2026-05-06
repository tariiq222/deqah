'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@deqah/ui/lib/cn';

interface NavItem {
  href: string;
  labelKey: string;
  /** Sub-items render only when the parent (or any sibling) is active. */
  children?: ReadonlyArray<{ href: string; labelKey: string }>;
}

const ITEMS: ReadonlyArray<NavItem> = [
  { href: '/', labelKey: 'nav.overview' },
  { href: '/organizations', labelKey: 'nav.organizations' },
  { href: '/users', labelKey: 'nav.users' },
  { href: '/plans', labelKey: 'nav.plans' },
  { href: '/verticals', labelKey: 'nav.verticals' },
  {
    href: '/billing',
    labelKey: 'nav.billing',
    children: [{ href: '/billing/zoho', labelKey: 'nav.billingZoho' }],
  },
  { href: '/metrics', labelKey: 'nav.metrics' },
  { href: '/audit-log', labelKey: 'nav.auditLog' },
  { href: '/impersonation-sessions', labelKey: 'nav.impersonation' },
  { href: '/notifications', labelKey: 'nav.notifications' },
  { href: '/settings', labelKey: 'nav.settings' },
];

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const parentActive = isActive(item.href, pathname);
        return (
          <div key={item.href} className="flex flex-col gap-1">
            <Link
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm transition',
                parentActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t(item.labelKey)}
            </Link>
            {item.children && parentActive
              ? item.children.map((child) => {
                  const active = isActive(child.href, pathname);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        'ms-4 rounded-md px-3 py-1.5 text-xs transition',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {t(child.labelKey)}
                    </Link>
                  );
                })
              : null}
          </div>
        );
      })}
    </nav>
  );
}
