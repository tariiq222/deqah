import { NextResponse, type NextRequest } from 'next/server';

// Admin app has a single gate: anything outside /login requires a session
// marker. The JWT itself is stored in localStorage (inaccessible to
// middleware), so we use a lightweight cookie marker set on successful
// login + cleared on logout. The real auth check happens server-side on
// every API call via the existing JwtGuard + SuperAdminGuard chain — this
// middleware just keeps the URL tidy and redirects unauthenticated users
// back to the login page.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const marker = req.cookies.get('admin.authenticated')?.value === '1';

  const publicPaths = new Set(['/login', '/forgot-password', '/reset-password']);
  if (publicPaths.has(pathname) || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (!marker) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
