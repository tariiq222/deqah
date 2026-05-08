import type { ReactNode } from 'react';
import { Sidebar } from '@/shell/sidebar';
import { LogoutButton } from '@/shell/logout-button';
import { useTranslations } from 'next-intl';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-border bg-card px-4 py-6">
        <div className="mb-6 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diqqa-logo.svg" alt="Deqah" className="h-7 w-auto mb-3" />
          <h1 className="text-sm font-semibold">{t('title')}</h1>
          <p className="text-xs text-muted-foreground">Platform control plane</p>
        </div>
        <Sidebar />
        <div className="mt-8 border-t border-border px-2 pt-4">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 h-screen overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
