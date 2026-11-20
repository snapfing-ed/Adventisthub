import { NextResponse } from 'next/server';

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // Protect admin UI routes — redirect to /admin-portal if no server session cookie
  if (pathname.startsWith('/admin-portal') || pathname === '/admin') {
    const session = req.cookies.get('session') || req.cookies.get('__session');
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin-portal';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin-portal/:path*', '/admin'],
};
