import { useTranslations } from 'next-intl';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

export function Hero() {
  const t = useTranslations('hero');
  const waUrl = buildWhatsAppUrl('مرحباً، أريد الاستفسار عن منصة دِقة');

  return (
    <section
      id="hero"
      className="relative overflow-hidden min-h-screen flex items-center justify-center pt-16"
    >
      {/* Animated background blobs — CSS only, no JS */}
      <div
        className="blob blob-blue"
        style={{ width: 600, height: 600, top: '-10%', insetInlineEnd: '-5%' }}
        aria-hidden="true"
      />
      <div
        className="blob blob-green"
        style={{ width: 400, height: 400, bottom: '5%', insetInlineStart: '-5%' }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight mb-6">
          {t('title')}
        </h1>

        <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t('subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#82CC17] hover:bg-[#6aaa12] text-white font-semibold text-base px-8 py-4 rounded-xl transition-colors shadow-lg shadow-[#82CC17]/30"
          >
            {t('ctaPrimary')}
          </a>

          <a
            href="#pricing"
            className="inline-flex items-center gap-2 border border-[#354FD8] text-[#354FD8] hover:bg-[#354FD8]/5 font-semibold text-base px-8 py-4 rounded-xl transition-colors"
          >
            {t('ctaSecondary')}
          </a>
        </div>
      </div>
    </section>
  );
}
