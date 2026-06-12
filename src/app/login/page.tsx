'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      router.replace(from.startsWith('/login') ? '/' : from);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-emerald-500 flex items-center justify-center font-bold text-white text-2xl mx-auto mb-3">
            Q
          </div>
          <h1 className="text-2xl font-bold text-white">Staff Login</h1>
          <p className="text-slate-400 text-sm mt-1">QFlow Admin — Mukono Health Centre IV</p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white rounded-2xl shadow-xl p-6 space-y-4"
        >
          <p className="text-sm text-gray-600">
            Sign in to access the queue admin console. Patient registration and the waiting area display remain public.
          </p>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              placeholder="Enter admin password"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-slate-500">
          <Link href="/register" className="text-emerald-400 hover:underline">
            Patient registration
          </Link>
          <span className="hidden sm:inline text-slate-600">·</span>
          <Link href="/display" className="text-emerald-400 hover:underline">
            Waiting area display
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
