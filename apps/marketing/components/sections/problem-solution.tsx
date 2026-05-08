import { useTranslations } from 'next-intl';
import { X, Check } from 'lucide-react';

export function ProblemSolution() {
  const t = useTranslations('problemSolution');

  const painPoints = [
    t('pain1'),
    t('pain2'),
    t('pain3'),
    t('pain4'),
  ] as const;

  const gains = [
    t('gain1'),
    t('gain2'),
    t('gain3'),
    t('gain4'),
  ] as const;

  return (
    <section id="problem-solution" className="py-24 bg-[#f8f9fb]">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 text-center mb-16">
          {t('heading')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Before column */}
          <div className="glass rounded-2xl p-8 border border-red-100">
            <h3 className="text-xl font-semibold text-red-600 mb-6 flex items-center gap-2">
              <X className="size-5 shrink-0" aria-hidden="true" />
              {t('beforeLabel')}
            </h3>
            <ul className="space-y-4">
              {painPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-700">
                  <span className="mt-0.5 size-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center shrink-0 text-xs font-bold">
                    ✕
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* After column */}
          <div className="glass rounded-2xl p-8 border border-[#82CC17]/30">
            <h3 className="text-xl font-semibold text-[#6aaa12] mb-6 flex items-center gap-2">
              <Check className="size-5 shrink-0" aria-hidden="true" />
              {t('afterLabel')}
            </h3>
            <ul className="space-y-4">
              {gains.map((gain, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-700">
                  <span className="mt-0.5 size-5 rounded-full bg-[#82CC17]/15 text-[#6aaa12] flex items-center justify-center shrink-0 text-xs font-bold">
                    ✓
                  </span>
                  {gain}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
