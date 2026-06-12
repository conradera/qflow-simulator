import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isAdminAuthEnabled,
  verifyAdminSessionToken,
  SESSION_COOKIE,
} from '@/lib/adminAuth';

const PUBLIC_PAGE_PREFIXES = ['/display', '/register', '/login'];

const PUBLIC_API_PREFIXES = ['/api/queue/join', '/api/auth/login'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAdminAuthEnabled()) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifyAdminSessionToken(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..$).*)'],
};
