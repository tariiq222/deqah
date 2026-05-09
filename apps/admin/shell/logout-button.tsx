'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@deqah/ui/primitives/button';

export function LogoutButton() {
  const router = useRouter();
  const t = useTranslations('common');
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      onClick={() => {
        window.localStorage.removeItem('admin.accessToken');
        const secureFlag = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `admin.authenticated=; path=/; SameSite=Strict${secureFlag}; Max-Age=0`;
        router.push('/login');
      }}
    >
      {t('signOut')}
    </Button>
  );
}
