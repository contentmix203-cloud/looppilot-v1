"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  async function handleGoogleLogin() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/google/url", { cache: "no-store" });
      const data = await res.json();
      const url = data.authorize_url || data.url;
      if (!url) throw new Error("Missing authorize_url");
      window.location.href = url;
    } catch (e: any) {
      setErr(e.message || "Failed to start Google login");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-start justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Log in</h1>

        <button
          onClick={handleGoogleLogin}
          disabled={busy}
          className="w-full rounded bg-black px-4 py-2 text-white"
        >
          {busy ? "Opening Google…" : "Sign in with Google"}
        </button>

        <div className="text-sm text-gray-600">— or —</div>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            className="w-full rounded border p-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded border p-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white"
          >
            {busy ? "Signing in…" : "Log in"}
          </button>
        </form>

        <div className="text-sm">
          No account? <a className="underline" href="/signup">Sign up</a>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </main>
  );
}
