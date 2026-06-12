import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminSessionToken,
  isAdminAuthEnabled,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  if (!isAdminAuthEnabled()) {
    return NextResponse.json(
      { error: 'Admin login is not configured on this server' },
      { status: 503 }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const password = body.password?.trim();
  if (!password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  if (password !== process.env.ADMIN_PASSWORD?.trim()) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createAdminSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SEC,
    path: '/',
  });
  return res;
}
