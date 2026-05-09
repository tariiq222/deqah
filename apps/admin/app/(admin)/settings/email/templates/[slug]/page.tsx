'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getTemplate,
  updateTemplate,
  previewTemplate,
  PlatformEmailTemplateDetail,
  UpdateTemplateBody,
} from '@/features/platform-email/platform-email.api';
import { ApiError } from '@/lib/api-client';

export default function EmailTemplateEditorPage() {
  const t = useTranslations('settings.email.templates');
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [template, setTemplate] = useState<PlatformEmailTemplateDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [subjectAr, setSubjectAr] = useState('');
  const [subjectEn, setSubjectEn] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Preview state
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!slug) return;
    getTemplate(slug)
      .then((t) => {
        setTemplate(t);
        setName(t.name);
        setSubjectAr(t.subjectAr);
        setSubjectEn(t.subjectEn);
        setHtmlBody(t.htmlBody);
        setIsActive(t.isActive);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load template')) // TODO i18n: Failed to load template
      .finally(() => setIsLoading(false));
  }, [slug]);

  const isLocked = template?.isLocked ?? false;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveResult(null);
    const body: UpdateTemplateBody = { isActive };
    if (!isLocked) {
      body.name = name;
      body.subjectAr = subjectAr;
      body.subjectEn = subjectEn;
      body.htmlBody = htmlBody;
    }
    try {
      const updated = await updateTemplate(slug, body);
      setTemplate(updated);
      setSaveResult({ ok: true, message: t('editor.save') });
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof ApiError ? err.message : 'Save failed', // TODO i18n: Save failed
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const result = await previewTemplate(slug, {});
      setPreview(result);
    } catch {
      // ignore preview errors
    } finally {
      setIsPreviewing(false);
    }
  };

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{template?.name ?? slug}</h2>
          <p className="text-sm text-muted-foreground font-mono">{slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {isLocked && (
            <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              {/* TODO i18n: Locked — content read-only */}
              Locked — content read-only
            </span>
          )}
          <span className="text-xs text-muted-foreground">v{template?.version}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">{/* TODO i18n: Name */}Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLocked}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{/* TODO i18n: Subject (Arabic) */}Subject (Arabic)</label>
            <input
              type="text"
              value={subjectAr}
              onChange={(e) => setSubjectAr(e.target.value)}
              disabled={isLocked}
              dir="rtl"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{/* TODO i18n: Subject (English) */}Subject (English)</label>
            <input
              type="text"
              value={subjectEn}
              onChange={(e) => setSubjectEn(e.target.value)}
              disabled={isLocked}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{t('editor.htmlBody')}</label>
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              disabled={isLocked}
              rows={12}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-input"
            />
            <label htmlFor="is-active" className="text-sm font-medium">{/* TODO i18n: Active */}Active</label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isSaving ? t('editor.saving') : t('editor.save')}
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing}
              className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              {/* TODO i18n: Loading... (no key in JSON) */}
              {isPreviewing ? 'Loading...' : t('editor.preview')}
            </button>
          </div>

          {saveResult && (
            <div
              className={`rounded-md p-3 text-sm ${
                saveResult.ok
                  ? 'bg-success/10 text-success border border-success/30'
                  : 'bg-destructive/10 text-destructive border border-destructive/30'
              }`}
            >
              {saveResult.message}
            </div>
          )}
        </form>

        {/* Preview iframe */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('editor.preview')}</p>
          {preview ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('editor.subject')}: {preview.subject}</p>
              <iframe
                srcDoc={preview.html}
                className="w-full rounded-lg border border-border"
                style={{ height: '500px' }}
                title="Email preview"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border h-64 text-sm text-muted-foreground">
              {/* TODO i18n: Click "Preview" to render the template */}
              Click &quot;Preview&quot; to render the template
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
