import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Sidebar } from '@/shell/sidebar';
import { Topbar } from '@/shell/topbar';
import { OfflineBanner } from '@/components/offline-banner';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />
      <div className="grid min-h-screen" style={{ gridTemplateColumns: '240px 1fr' }}>
        <aside className="sticky top-0 h-screen border-r border-border bg-surface-solid">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 px-5 pb-6 pt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/diqqa-logo.svg" alt="Deqah" className="h-6 w-auto" />
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-medium text-foreground">{t('title')}</span>
                <span className="text-[11px] text-muted-foreground">{t('subtitle')}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <Sidebar />
            </div>
          </div>
        </aside>
        <div className="flex min-h-screen flex-col">
          <Topbar />
          <main className="flex-1">
            <div className="mx-auto max-w-[1400px] px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
