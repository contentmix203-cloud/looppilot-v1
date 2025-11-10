import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  if (err) return NextResponse.redirect(new URL('/login?google=error', site));
  if (!code) return NextResponse.redirect(new URL('/login?google=missing_code', site));

  // 1) Exchange code for tokens
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    grant_type: 'authorization_code',
  });

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!resp.ok) {
    return NextResponse.redirect(new URL('/login?google=token_failed', site));
  }

  const tok = await resp.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  // 2) Identify the signed-in user
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?google=no_session', site));

  // 3) Save tokens
  const expiry = new Date(Date.now() + tok.expires_in * 1000).toISOString();

  const { error: upsertErr } = await supabase.from('google_oauth_tokens').upsert({
    user_id: user.id,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? '',
    scope: tok.scope,
    token_type: tok.token_type,
    expiry_ts: expiry,
  });

  if (upsertErr) {
    return NextResponse.redirect(new URL('/login?google=db_error', site));
  }

  await supabase.from('gmail_sync_state').upsert({
    user_id: user.id,
    last_sync_at: null,
    last_history_id: null,
  });

  // 4) Done
  return NextResponse.redirect(new URL('/dashboard?google=connected', site));
}
