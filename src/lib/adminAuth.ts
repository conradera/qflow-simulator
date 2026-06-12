const SESSION_COOKIE = 'qflow_admin';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export function isAdminAuthEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    'qflow-dev-secret'
  );
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function createAdminSessionToken(): Promise<string> {
  const payload = {
    exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
    v: 1,
  };
  const data = btoa(JSON.stringify(payload));
  const sig = await hmacSign(data, getSessionSecret());
  return `${data}.${sig}`;
}

export async function verifyAdminSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [data, sig] = token.split('.');
  if (!data || !sig) return false;

  try {
    const expected = await hmacSign(data, getSessionSecret());
    if (!timingSafeEqual(sig, expected)) return false;
    const payload = JSON.parse(atob(data)) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export { SESSION_COOKIE, SESSION_MAX_AGE_SEC };
