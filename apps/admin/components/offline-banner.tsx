'use client';
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const t = useTranslations('offline');
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex h-7 w-full items-center justify-center gap-1.5 bg-warning/12 text-foreground"
    >
      <WifiOff aria-hidden size={12} strokeWidth={1.75} className="shrink-0" />
      <span className="text-[12px] font-medium">
        {t('message')}
      </span>
    </div>
  );
}
