'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@deqah/ui/primitives/button';

export function LogoutButton() {
  const router = useRouter();
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
      Sign out
    </Button>
  );
}
