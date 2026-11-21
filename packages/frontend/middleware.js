import { NextResponse } from 'next/server';

export function middleware(req) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') || '';
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';

  // Extract tenant subdomain (e.g., mupcm.localhost:3000 -> mupcm)
  let tenantSlug = '';
  if (host.endsWith(`.${rootDomain}`)) {
    const sub = host.slice(0, -(rootDomain.length + 1));
    if (sub && sub !== 'www') {
      tenantSlug = sub.toLowerCase();
    }
  }

  const requestHeaders = new Headers(req.headers);
  if (tenantSlug) {
    requestHeaders.set('x-tenant-slug', tenantSlug);
  }

  // Protect officer & platform-admin portals
  if (pathname.startsWith('/admin-portal') || pathname.startsWith('/platform-admin')) {
    const session = req.cookies.get('session');
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
