import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Sans_Arabic, Geist, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { readThemeCookie } from '@/lib/theme.server';
import './globals.css';

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-geist',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'دقة — لوحة التحكم',
  description: 'لوحة تحكم منصّة دقة للفريق الداخلي',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  const theme = await readThemeCookie();

  const htmlClass = [
    plexArabic.variable,
    geist.variable,
    jetbrainsMono.variable,
    theme === 'dark' ? 'dark' : theme === 'light' ? '' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <html lang="ar" dir="rtl" className={htmlClass} suppressHydrationWarning>
      <head>
        {theme === 'system' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var mql=window.matchMedia('(prefers-color-scheme: dark)');if(mql.matches)document.documentElement.classList.add('dark');mql.addEventListener('change',function(e){document.documentElement.classList.toggle('dark',e.matches)});}catch(e){}})();`,
            }}
          />
        )}
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
