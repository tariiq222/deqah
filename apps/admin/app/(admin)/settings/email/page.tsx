'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { testSend } from '@/features/platform-email/platform-email.api';
import { ApiError } from '@/lib/api-client';

export default function EmailSettingsPage() {
  const t = useTranslations('settings.email');

  const [testTo, setTestTo] = useState('');
  const [testSlug, setTestSlug] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setTestResult(null);
    try {
      const result = await testSend({ slug: testSlug, to: testTo });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        reason: err instanceof ApiError ? err.message : 'Unexpected error', // TODO i18n: Unexpected error
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('description')}
        </p>
      </div>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-medium">{t('testSend.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {/* TODO i18n: Send a test email using any platform template. Useful to verify Resend configuration is working. */}
          Send a test email using any platform template. Useful to verify Resend configuration is working.
        </p>
        <form onSubmit={handleTestSend} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="test-slug" className="text-sm font-medium">
                {t('testSend.slug')}
              </label>
              <input
                id="test-slug"
                type="text"
                value={testSlug}
                onChange={(e) => setTestSlug(e.target.value)}
                placeholder="e.g. tenant-welcome"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="test-to" className="text-sm font-medium">
                {t('testSend.to')}
              </label>
              <input
                id="test-to"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSending}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSending ? t('testSend.submitting') : t('testSend.submit')}
          </button>
        </form>

        {testResult && (
          <div
            className={`rounded-md p-3 text-sm ${
              testResult.ok
                ? 'bg-success/10 text-success border border-success/30'
                : 'bg-destructive/10 text-destructive border border-destructive/30'
            }`}
          >
            {/* TODO i18n: 'Unknown error' fallback has no JSON key */}
            {testResult.ok ? t('testSend.success') : `${t('testSend.failedPrefix')}${testResult.reason ?? 'Unknown error'}`}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-medium">{t('templates.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('templates.description')}
        </p>
        <Link
          href="/settings/email/templates"
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          {t('templates.viewAll')}
        </Link>
      </div>

      <div className="rounded-lg border border-border p-6 space-y-4">
        <h3 className="font-medium">{t('logs.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('logs.description')}
        </p>
        <Link
          href="/settings/email/logs"
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          {t('logs.viewLogs')}
        </Link>
      </div>
    </div>
  );
}
