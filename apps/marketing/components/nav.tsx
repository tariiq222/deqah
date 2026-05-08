'use client';

import { useTranslations, useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

export function Nav() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale() {
    const targetLocale = locale === 'ar' ? 'en' : 'ar';
    // Strip current locale prefix if present, then prepend target
    const withoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';
    const newPath =
      targetLocale === 'ar' ? withoutLocale : `/${targetLocale}${withoutLocale}`;
    router.push(newPath);
  }

  const waUrl = buildWhatsAppUrl('مرحباً، أريد الاستفسار عن منصة دِقة');

  return (
    <header className="fixed top-0 inset-x-0 z-50 glass border-b border-white/20">
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <span className="text-xl font-bold text-[#354FD8] tracking-tight">
          {t('logo')}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={switchLocale}
            className="text-sm font-medium text-slate-600 hover:text-[#354FD8] transition-colors px-3 py-1.5 rounded-md hover:bg-slate-100"
          >
            {t('switchLang')}
          </button>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#82CC17] hover:bg-[#6aaa12] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {t('whatsapp')}
          </a>
        </div>
      </nav>
    </header>
  );
}
