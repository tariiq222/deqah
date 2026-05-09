'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  Eye,
  Receipt,
  Layers,
  Tags,
  Bell,
  Settings,
  LineChart,
  ScrollText,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@deqah/ui/lib/cn';

interface NavChild {
  href: string;
  labelKey: string;
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  hint?: string;
  children?: NavChild[];
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    titleKey: 'sections.operate',
    items: [
      { href: '/', labelKey: 'overview', icon: LayoutDashboard },
      { href: '/organizations', labelKey: 'organizations', icon: Building2 },
      { href: '/users', labelKey: 'users', icon: Users },
      { href: '/impersonation-sessions', labelKey: 'impersonation', icon: Eye },
    ],
  },
  {
    titleKey: 'sections.money',
    items: [
      {
        href: '/billing',
        labelKey: 'billing',
        icon: Receipt,
        children: [{ href: '/billing/zoho', labelKey: 'billingZoho' }],
      },
      { href: '/plans', labelKey: 'plans', icon: Layers },
    ],
  },
  {
    titleKey: 'sections.configure',
    items: [
      { href: '/verticals', labelKey: 'verticals', icon: Tags },
      { href: '/notifications', labelKey: 'notifications', icon: Bell },
      { href: '/settings', labelKey: 'settings', icon: Settings },
    ],
  },
  {
    titleKey: 'sections.inspect',
    items: [
      { href: '/metrics', labelKey: 'metrics', icon: LineChart },
      { href: '/audit-log', labelKey: 'auditLog', icon: ScrollText },
    ],
  },
];

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon: Icon,
  hint,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  hint?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-surface-muted text-foreground'
          : 'text-muted-foreground hover:bg-surface-muted/60 hover:text-foreground',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1 start-0 w-0.5 rounded-full bg-primary"
        />
      )}
      <Icon size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="hidden shrink-0 font-mono text-[10px] tracking-widest text-muted-foreground/50 sm:block">
          {hint}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav aria-label={t('aria.mainNavigation')}>
      {NAV.map((section, sectionIdx) => (
        <div key={section.titleKey} className={cn('flex flex-col gap-0.5', sectionIdx > 0 && 'mt-4')}>
          <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            {t(section.titleKey)}
          </p>
          {section.items.map((item) => {
            const parentActive = isActive(item.href, pathname);
            return (
              <div key={item.href} className="flex flex-col gap-0.5">
                <NavLink
                  href={item.href}
                  label={t(item.labelKey)}
                  icon={item.icon}
                  hint={item.hint}
                  active={parentActive}
                />
                {item.children && parentActive
                  ? item.children.map((child) => {
                      const childActive = isActive(child.href, pathname);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            'ms-6 rounded-md px-3 py-1 text-[12px] transition-colors',
                            childActive
                              ? 'text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
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
        </div>
      ))}
    </nav>
  );
}
