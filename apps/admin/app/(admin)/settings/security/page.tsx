'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as ipaddr from 'ipaddr.js';
import { ApiError } from '@/lib/api-client';
import {
  getSecuritySettings,
  updateSecuritySettings,
  type SecuritySettings,
} from '@/features/security-settings/security-settings.api';

function isValidCidrOrIp(entry: string): boolean {
  if (!entry) return false;
  try {
    if (entry.includes('/')) ipaddr.parseCIDR(entry);
    else ipaddr.parse(entry);
    return true;
  } catch {
    return false;
  }
}

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function SecuritySettingsPage() {
  const t = useTranslations('settings.security');

  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ipErrors, setIpErrors] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getSecuritySettings();
        setSettings(result);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('loadError'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t]);

  const handleSave = async () => {
    if (!settings) return;

    const invalid = settings.ipAllowlist.filter((line) => !isValidCidrOrIp(line));
    if (invalid.length > 0) {
      setIpErrors(invalid);
      return;
    }
    setIpErrors([]);

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateSecuritySettings(settings);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="h-16 rounded-lg border border-border bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!settings && error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {/* Session TTL */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-medium">{t('sessionTtl.title')}</h3>
        <div className="space-y-1 max-w-xs">
          <label className="text-sm font-medium">{t('sessionTtl.label')}</label>
          <input
            type="number"
            min={15}
            max={1440}
            value={settings.sessionTtlMinutes}
            onChange={(e) =>
              setSettings({ ...settings, sessionTtlMinutes: Number(e.target.value) })
            }
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">{t('sessionTtl.hint')}</p>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-medium">{t('twoFactor.title')}</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            id="require2fa"
            checked={settings.require2fa}
            onChange={(e) =>
              setSettings({ ...settings, require2fa: e.target.checked })
            }
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span className="text-sm font-medium">{t('twoFactor.label')}</span>
        </label>
      </div>

      {/* IP Allowlist */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-medium">{t('ipAllowlist.title')}</h3>
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('ipAllowlist.label')}</label>
          <textarea
            className={`${inputClass} font-mono`}
            rows={4}
            value={settings.ipAllowlist.join('\n')}
            onChange={(e) => {
              setIpErrors([]);
              setSettings({
                ...settings,
                ipAllowlist: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
            }}
          />
          {ipErrors.length > 0 && (
            <ul className="text-xs text-destructive mt-1">
              {ipErrors.map((e) => (
                <li key={e}>
                  {t('ipAllowlist.invalidEntry', { entry: e })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">
          {t('saveSuccess')}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  );
}
