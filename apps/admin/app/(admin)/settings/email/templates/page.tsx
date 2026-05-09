'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { listTemplates, PlatformEmailTemplateListItem } from '@/features/platform-email/platform-email.api';
import { ApiError } from '@/lib/api-client';

export default function EmailTemplatesListPage() {
  const t = useTranslations('settings.email.templates');

  const [templates, setTemplates] = useState<PlatformEmailTemplateListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load templates')) // TODO i18n: Failed to load templates
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {/* TODO i18n: {templates.length} template{templates.length !== 1 ? 's' : ''} registered. */}
          {templates.length} template{templates.length !== 1 ? 's' : ''} registered.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tmpl) => (
          <Link
            key={tmpl.id}
            href={`/settings/email/templates/${tmpl.slug}`}
            className="rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{tmpl.slug}</span>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  tmpl.isActive
                    ? 'bg-success/10 text-success border border-success/30'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tmpl.isActive ? t('active') : t('inactive')}
              </span>
            </div>
            <p className="text-sm font-medium">{tmpl.name}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>v{tmpl.version}</span>
              {tmpl.isLocked && (
                <span className="rounded bg-muted px-1.5 py-0.5">{t('locked')}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
