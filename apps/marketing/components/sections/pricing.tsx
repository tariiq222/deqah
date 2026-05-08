// TODO: Pricing copy (tier names in Arabic, actual prices) to be finalized by user.
// Replace "---" placeholders in messages/ar.json and messages/en.json.

import { useTranslations } from 'next-intl';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { Check } from 'lucide-react';

type Tier = 'starter' | 'pro' | 'scale';

const TIERS: Tier[] = ['starter', 'pro', 'scale'];

function PricingCard({
  tier,
  isPopular,
}: {
  tier: Tier;
  isPopular: boolean;
}) {
  const t = useTranslations('pricing');

  const tierName = t(`${tier}.name`);
  const price = t(`${tier}.price`);
  const description = t(`${tier}.description`);
  const features = t.raw(`${tier}.features`) as string[];
  const ctaMessage = `مرحباً، أريد الاستفسار عن خطة ${tierName} في منصة دِقة`;
  const waUrl = buildWhatsAppUrl(ctaMessage);

  return (
    <div
      className={[
        'relative flex flex-col rounded-2xl p-8 transition-shadow',
        isPopular
          ? 'glass border-2 border-[#354FD8] shadow-xl shadow-[#354FD8]/15'
          : 'glass border border-slate-200 shadow-sm hover:shadow-md',
      ].join(' ')}
    >
      {isPopular && (
        <div className="absolute -top-3.5 inset-x-0 flex justify-center">
          <span className="bg-[#354FD8] text-white text-xs font-semibold px-4 py-1 rounded-full">
            {t('popular')}
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-slate-900 mb-1">{tierName}</h3>
        <p className="text-sm text-slate-500 mb-4">{description}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-slate-900">{price}</span>
          <span className="text-slate-500 text-sm">{t('priceUnit')}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature: string, i: number) => (
          <li key={i} className="flex items-center gap-2.5 text-sm text-slate-700">
            <Check
              className="size-4 text-[#82CC17] shrink-0"
              aria-hidden="true"
            />
            {feature}
          </li>
        ))}
      </ul>

      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          'inline-flex items-center justify-center font-semibold text-sm px-6 py-3 rounded-xl transition-colors',
          isPopular
            ? 'bg-[#354FD8] hover:bg-[#2a3fb0] text-white shadow-md shadow-[#354FD8]/30'
            : 'border border-[#354FD8] text-[#354FD8] hover:bg-[#354FD8]/5',
        ].join(' ')}
      >
        {t('ctaButton')}
      </a>
    </div>
  );
}

export function Pricing() {
  const t = useTranslations('pricing');

  return (
    <section id="pricing" className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 text-center mb-16">
          {t('heading')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {TIERS.map((tier) => (
            <PricingCard key={tier} tier={tier} isPopular={tier === 'pro'} />
          ))}
        </div>
      </div>
    </section>
  );
}
