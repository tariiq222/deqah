'use client';
import Link from 'next/link';
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
  const trail = matchTrail(pathname);
  if (!trail) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex items-center gap-1.5">
        {trail.map((seg, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {seg.href ? (
              <Link href={seg.href} className="hover:text-foreground transition-colors">
                {seg.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {seg.label}
              </span>
            )}
            {i < trail.length - 1 && <span aria-hidden>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
