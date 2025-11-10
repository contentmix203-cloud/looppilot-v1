'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export default function SignupPage() {
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    // Create account
    const { error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      setBusy(false);
      setErr(signUpErr.message);
      return;
    }

    // Sign in to create a session
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInErr) {
      setErr(signInErr.message);
      return;
    }

    // Go to dashboard after account creation
    window.location.href = '/dashboard';
  }

  async function handleGoogleConnect() {
    setBusy(true);
    setErr(null);

    // Require an authenticated session first
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setErr('Create your LoopPilot account first, then connect Gmail.');
      return;
    }

    try {
      const res = await fetch('/api/auth/google/url', { cache: 'no-store' });
      const data = await res.json();
      const url = data.authorize_url || data.url;
      if (!url) throw new Error('Missing authorize_url from server');
      window.location.href = url;
    } catch (e: any) {
      setBusy(false);
      setErr(e.message || 'Failed to start Google connect');
    }
  }

  return (
    <main className="min-h-screen flex items-start justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Sign up</h1>

        {/* Connect Gmail button (works after signup creates a session) */}
        <button
          onClick={handleGoogleConnect}
          disabled={busy}
          className="w-full rounded bg-black px-4 py-2 text-white"
        >
          {busy ? 'Working…' : 'Sign in with Google (connect Gmail)'}
        </button>

        <div className="text-sm text-gray-600">— or create your account —</div>

        <form onSubmit={handleSignup} className="space-y-3">
          <input
            className="w-full rounded border p-2"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded border p-2"
            type="password"
            placeholder="Password (min 6 chars)"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-green-600 px-4 py-2 text-white"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="text-sm">
          Already have an account? <a className="underline" href="/login">Log in</a>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </main>
  );
}
