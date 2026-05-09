'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BREADCRUMB_TRAILS } from './breadcrumbs.config';

function matchTrail(pathname: string) {
  if (BREADCRUMB_TRAILS[pathname]) return BREADCRUMB_TRAILS[pathname];
  const segments = pathname.split('/').filter(Boolean);
  for (const key of Object.keys(BREADCRUMB_TRAILS)) {
    const keySegs = key.split('/').filter(Boolean);
    if (keySegs.length !== segments.length) continue;
    const matches = keySegs.every((seg, i) => seg.startsWith(':') || seg === segments[i]);
    if (matches) return BREADCRUMB_TRAILS[key];
  }
  return null;
}

export function Breadcrumbs({ pathname }: { pathname: string }) {
  const t = useTranslations('breadcrumbs');
  const trail = matchTrail(pathname);
  if (!trail) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex items-center h-7">
      <ol className="flex items-center gap-1">
        {trail.map((seg, idx) => {
          const isLast = idx === trail.length - 1;
          const label = t(seg.key);
          return (
            <li key={seg.href ?? seg.key} className="flex items-center gap-1">
              {seg.href ? (
                <Link
                  href={seg.href}
                  className="text-[13px] font-normal text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="text-[13px] font-medium text-foreground"
                >
                  {label}
                </span>
              )}
              {!isLast && (
                <ChevronRight
                  aria-hidden
                  size={12}
                  strokeWidth={1.5}
                  className="text-muted-foreground/60 shrink-0"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
