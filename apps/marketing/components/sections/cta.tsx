import { useTranslations } from 'next-intl';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

export function Cta() {
  const t = useTranslations('cta');
  const waUrl = buildWhatsAppUrl('مرحباً، أريد البدء مع منصة دِقة');

  return (
    <section id="cta" className="py-24 bg-[#f8f9fb]">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
          {t('heading')}
        </h2>

        <p className="text-lg text-slate-600 mb-10">
          {t('subheading')}
        </p>

        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 bg-[#82CC17] hover:bg-[#6aaa12] text-white font-bold text-lg px-10 py-5 rounded-2xl transition-colors shadow-xl shadow-[#82CC17]/30"
        >
          {t('button')}
        </a>
      </div>
    </section>
  );
}
