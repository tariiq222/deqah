'use client';
import { useState, useEffect, startTransition } from 'react';
import { useTranslations } from 'next-intl';
import { getSystemHealth, type SystemHealthResult } from '@/features/system-health/system-health.api';

const STATUS_COLOR = {
  ok: 'bg-green-100 text-green-800',
  degraded: 'bg-yellow-100 text-yellow-800',
  down: 'bg-red-100 text-red-800',
};

export default function SystemHealthPage() {
  const t = useTranslations('settings.system');
  const [health, setHealth] = useState<SystemHealthResult | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setHealth(await getSystemHealth()); } finally { setLoading(false); }
  };

  useEffect(() => { startTransition(() => { void refresh(); }); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <button onClick={refresh} disabled={loading} className="text-sm border border-border rounded px-3 py-1.5 hover:bg-muted disabled:opacity-50">
          {loading ? t('checking') : t('refresh')}
        </button>
      </div>

      {health && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t('overall')}</span>
            <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[health.overall]}`}>
              {health.overall.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground">{t('asOf', { time: new Date(health.checkedAt).toLocaleTimeString() })}</span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="pb-2 font-medium">{t('subsystem')}</th>
                <th className="pb-2 font-medium">{t('status')}</th>
                <th className="pb-2 font-medium">{t('latency')}</th>
                <th className="pb-2 font-medium">{t('detail')}</th>
              </tr>
            </thead>
            <tbody>
              {health.subsystems.map((s) => (
                <tr key={s.name} className="border-b border-border/40">
                  <td className="py-2 font-mono text-xs">{s.name}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                      {s.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 text-xs">{s.latencyMs}ms</td>
                  <td className="py-2 text-xs text-muted-foreground">{s.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
