'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getAllBillingSettings,
  updateBillingSetting,
  testMoyasarConnection,
  type BillingSettingEntry,
  type TestConnectionResult,
} from '@/features/billing-settings/billing-settings.api';
import { ApiError } from '@/lib/api-client';

const MOYASAR_KEYS = [
  'billing.moyasar.platformSecretKey',
  'billing.moyasar.platformWebhookSecret',
  'billing.moyasar.publicKey',
] as const;

const DEFAULTS_KEYS = [
  'billing.defaults.currency',
  'billing.defaults.taxPercent',
  'billing.defaults.trialDays',
] as const;

const SECRET_KEYS = new Set([
  'billing.moyasar.platformSecretKey',
  'billing.moyasar.platformWebhookSecret',
]);

function getFieldType(key: string): string {
  if (SECRET_KEYS.has(key)) return 'password';
  if (key === 'billing.defaults.taxPercent' || key === 'billing.defaults.trialDays') return 'number';
  return 'text';
}

export default function BillingSettingsPage() {
  const t = useTranslations('settings.billing');

  const LABELS: Record<string, string> = {
    'billing.moyasar.platformSecretKey': t('moyasar.platformSecretKey'),
    'billing.moyasar.platformWebhookSecret': t('moyasar.platformWebhookSecret'),
    'billing.moyasar.publicKey': t('moyasar.publicKey'),
    'billing.defaults.currency': t('defaults.currency'),
    'billing.defaults.taxPercent': t('defaults.taxPercent'),
    'billing.defaults.trialDays': t('defaults.trialDays'),
  };

  const [, setSettings] = useState<BillingSettingEntry[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveResult, setSaveResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    getAllBillingSettings()
      .then((res) => {
        setSettings(res.settings);
        const initial: Record<string, string> = {};
        for (const s of res.settings) {
          initial[s.key] = s.isSecret ? '' : String(s.value ?? '');
        }
        setValues(initial);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setLoadError(msg || t('loadError'));
      });
  }, [t]);

  async function handleSaveSection(keys: readonly string[]) {
    const sectionSaving: Record<string, boolean> = {};
    for (const k of keys) sectionSaving[k] = true;
    setSaving((prev) => ({ ...prev, ...sectionSaving }));

    const results: Record<string, { ok: boolean; message: string }> = {};
    await Promise.all(
      keys.map(async (key) => {
        const rawValue = values[key] ?? '';
        if (SECRET_KEYS.has(key) && rawValue === '') {
          results[key] = { ok: true, message: t('saveResult.skipped') };
          return;
        }
        const parsed = getFieldType(key) === 'number' ? Number(rawValue) : rawValue;
        try {
          await updateBillingSetting(key, parsed);
          results[key] = { ok: true, message: t('saveResult.saved') };
        } catch (err) {
          results[key] = { ok: false, message: err instanceof ApiError ? err.message : t('saveResult.failed') };
        }
      }),
    );

    setSaveResult((prev) => ({ ...prev, ...results }));
    const doneSaving: Record<string, boolean> = {};
    for (const k of keys) doneSaving[k] = false;
    setSaving((prev) => ({ ...prev, ...doneSaving }));
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testMoyasarConnection();
      setTestResult(result);
    } catch (err) {
      // TODO i18n: 'Unexpected error' fallback has no key in settings.billing.*
      setTestResult({ ok: false, error: err instanceof ApiError ? err.message : 'Unexpected error', latencyMs: 0 });
    } finally {
      setIsTesting(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      {/* Moyasar Credentials */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">{t('moyasar.title')}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('moyasar.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {isTesting ? t('moyasar.testing') : t('moyasar.testConnection')}
          </button>
        </div>

        {testResult && (
          <div
            className={`rounded-md p-3 text-sm ${
              testResult.ok
                ? 'bg-success/10 text-success border border-success/30'
                : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}
          >
            {testResult.ok
              ? t('moyasar.connectedOk', { latency: testResult.latencyMs, status: testResult.statusCode ?? '—' })
              /* TODO i18n: 'Unknown error' fallback has no key in settings.billing.* */
              : t('moyasar.connectedFail', { error: testResult.error ?? 'Unknown error', latency: testResult.latencyMs })}
          </div>
        )}

        <div className="grid gap-4">
          {MOYASAR_KEYS.map((key) => (
            <div key={key} className="space-y-1">
              <label htmlFor={key} className="text-sm font-medium">
                {LABELS[key]}
              </label>
              <input
                id={key}
                type={getFieldType(key)}
                value={values[key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={SECRET_KEYS.has(key) ? t('moyasar.secretPlaceholder') : ''}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {saveResult[key] && (
                <p className={`text-xs ${saveResult[key].ok ? 'text-success' : 'text-destructive'}`}>
                  {saveResult[key].message}
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => handleSaveSection(MOYASAR_KEYS)}
          disabled={MOYASAR_KEYS.some((k) => saving[k])}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {MOYASAR_KEYS.some((k) => saving[k]) ? t('moyasar.saving') : t('moyasar.save')}
        </button>
      </div>

      {/* Billing Defaults */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div>
          <h3 className="font-medium">{t('defaults.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('defaults.description')}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {DEFAULTS_KEYS.map((key) => (
            <div key={key} className="space-y-1">
              <label htmlFor={key} className="text-sm font-medium">
                {LABELS[key]}
              </label>
              <input
                id={key}
                type={getFieldType(key)}
                value={values[key] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              {saveResult[key] && (
                <p className={`text-xs ${saveResult[key].ok ? 'text-success' : 'text-destructive'}`}>
                  {saveResult[key].message}
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => handleSaveSection(DEFAULTS_KEYS)}
          disabled={DEFAULTS_KEYS.some((k) => saving[k])}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {DEFAULTS_KEYS.some((k) => saving[k]) ? t('defaults.saving') : t('defaults.save')}
        </button>
      </div>
    </div>
  );
}
