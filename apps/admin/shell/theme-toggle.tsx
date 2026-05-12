'use client';

import { Sun, Monitor, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@deqah/ui/lib/cn';
import type { Theme } from '@/lib/theme';
import { THEME_COOKIE } from '@/lib/theme';

const SEGMENTS: { value: Theme; icon: React.ElementType; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'light' },
  { value: 'system', icon: Monitor, labelKey: 'system' },
  { value: 'dark', icon: Moon, labelKey: 'dark' },
];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
}

function readCurrentTheme(): Theme {
  const match = document.cookie.match(/(?:^|;\s*)admin\.theme=([^;]+)/);
  const val = match?.[1];
  if (val === 'light' || val === 'dark' || val === 'system') return val;
  return 'system';
}

function writeCookie(theme: Theme) {
  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; SameSite=Lax${secureFlag}`;
}

export function ThemeToggle() {
  const [active, setActive] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return readCurrentTheme();
  });
  const t = useTranslations('theme');

  // When system is active, keep in sync with OS changes
  useEffect(() => {
    if (active !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', e.matches);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [active]);

  function select(theme: Theme) {
    writeCookie(theme);
    setActive(theme);
    applyTheme(theme);
  }

  return (
    <div
      role="group"
      aria-label={t('toggle')}
      className="flex h-7 items-center gap-0.5 rounded-md border border-border bg-surface-muted p-0.5"
    >
      {SEGMENTS.map(({ value, icon: Icon, labelKey }) => (
        <button
          key={value}
          type="button"
          aria-label={t(labelKey)}
          aria-pressed={active === value}
          onClick={() => select(value)}
          className={cn(
            'flex h-6 w-7 items-center justify-center rounded-sm transition-colors',
            active === value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  );
}
