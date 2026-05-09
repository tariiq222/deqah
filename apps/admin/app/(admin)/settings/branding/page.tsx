import { useTranslations } from 'next-intl';
import { BrandingForm } from '@/features/platform-branding/branding-form';

export default function BrandingSettingsPage() {
  const t = useTranslations('settings.branding');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('description')}
        </p>
      </div>
      <BrandingForm />
    </div>
  );
}
