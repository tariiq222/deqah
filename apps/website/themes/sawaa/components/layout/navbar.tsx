'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Calendar, Menu, X } from 'lucide-react';
import { useBranding } from '@/features/branding/public';
import { NAV_LINKS, SITE } from '../../lib/constants';

export function Navbar() {
  const branding = useBranding();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const brandName = branding.organizationNameAr || SITE.nameShort;
  const logo = branding.logoUrl ?? SITE.logo;

  return (
    <>
      <nav
        className="sw-nav-glass fixed top-4 left-1/2 z-[1000] w-[calc(100%-16px)] sm:w-[calc(100%-32px)] max-w-[1260px] rounded-full px-3 py-2 flex items-center justify-between transition-all duration-300"
        style={{
          transform: 'translateX(-50%)',
          background: scrolled ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)',
          border: '1px solid rgba(255,255,255,0.5)',
        }}
      >
        <Link href="/" aria-label={brandName} className="flex items-center ps-2 pe-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={brandName} className="h-7 sm:h-8 w-auto" style={{ display: 'block' }} />
        </Link>

        <div className="hidden md:flex gap-0.5 rounded-full p-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-4 py-2 text-[0.813rem] font-semibold rounded-full transition-all duration-200"
              style={{ color: 'var(--sw-neutral-700)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--sw-primary-700)';
                e.currentTarget.style.background = 'var(--sw-primary-50)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--sw-neutral-700)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 text-[0.813rem] font-bold px-5 py-2.5 rounded-full transition-all hover:-translate-y-0.5"
            style={{
              background: 'var(--sw-primary-500)',
              color: '#fff',
              boxShadow: 'var(--sw-shadow-primary)',
            }}
          >
            احجز موعدك
            <Calendar className="w-4 h-4" />
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen(true)}
          aria-label="فتح القائمة"
          className="md:hidden w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'var(--sw-primary-50)' }}
        >
          <Menu className="w-5 h-5" style={{ color: 'var(--sw-primary-700)' }} />
        </button>
      </nav>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-2 backdrop-blur-xl"
          style={{ background: 'rgba(255,255,255,0.98)' }}
        >
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="إغلاق القائمة"
            className="absolute top-6 end-6 w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'var(--sw-neutral-100)' }}
          >
            <X className="w-6 h-6" style={{ color: 'var(--sw-secondary-700)' }} />
          </button>
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className="text-xl font-semibold px-9 py-3.5 rounded-full transition"
              style={{ color: 'var(--sw-secondary-700)' }}
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/booking"
            onClick={() => setMobileOpen(false)}
            className="mt-5 inline-flex items-center gap-2 font-bold px-9 py-4 rounded-full"
            style={{
              background: 'var(--sw-primary-500)',
              color: '#fff',
              boxShadow: 'var(--sw-shadow-primary)',
            }}
          >
            احجز موعدك
            <Calendar className="w-4 h-4" />
          </Link>
        </div>
      ) : null}
    </>
  );
}
