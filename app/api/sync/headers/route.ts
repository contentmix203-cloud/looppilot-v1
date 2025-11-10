// app/api/sync/headers/route.ts
// Lists recent Gmail threads and returns a lightweight summary.
// This version fixes TS errors by using explicit types and a two-step "res -> data" pattern.

import { NextRequest, NextResponse } from 'next/server';
import { google, gmail_v1 } from 'googleapis';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseServer(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    }
  );
}

function buildQuery(minDays: number, maxDays: number): string {
  // Example: only messages where you sent the last email, and no reply within a window
  // You can refine later. This is just a safe default that compiles and runs.
  // from:me finds sent items; newer_than/older_than constrain window.
  const newer = `newer_than:${minDays}d`;
  const older = `older_than:${maxDays}d`;
  // Exclude chats and drafts
  return `from:me -in:chats -in:drafts ${newer} ${older}`;
}

function oauth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID as string,
    process.env.GOOGLE_CLIENT_SECRET as string,
    process.env.GOOGLE_REDIRECT_URI as string
  );
  return client;
}

async function getUserGoogleTokens(supabase: ReturnType<typeof getSupabaseServer>, userId: string) {
  // Adjust table/column names if your schema differs.
  // Expected table: public.google_tokens(user_id, access_token, refresh_token, expiry_date)
  const { data, error } = await supabase
    .from('google_tokens')
    .select('access_token, refresh_token, expiry_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as { access_token: string; refresh_token: string | null; expiry_date: number | null } | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServer(req);
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // optional body: { minDays?: number, maxDays?: number, maxPages?: number }
    const body = (await req.json().catch(() => ({}))) as {
      minDays?: number;
      maxDays?: number;
      maxPages?: number;
    };

    const minDays = typeof body.minDays === 'number' ? body.minDays : 3;
    const maxDays = typeof body.maxDays === 'number' ? body.maxDays : 7;
    const maxPages = typeof body.maxPages === 'number' ? body.maxPages : 3; // safety cap

    const tokens = await getUserGoogleTokens(supabase, user.id);
    if (!tokens?.access_token) {
      return NextResponse.json({ error: 'not_connected', message: 'Connect Google first.' }, { status: 400 });
    }

    const oAuth2 = oauth2Client();
    oAuth2.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oAuth2 });

    const q = buildQuery(minDays, maxDays);
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;

    const collected: Array<gmail_v1.Schema$Thread> = [];

    do {
      const res = await gmail.users.threads.list({
        userId: 'me',
        q,
        maxResults: 100,
        pageToken: nextPageToken,
      });

      const data = res.data as gmail_v1.Schema$ListThreadsResponse;
      nextPageToken = data.nextPageToken ?? undefined;

      const batch = data.threads ?? [];
      collected.push(...batch);

      pageCount += 1;
      if (pageCount >= maxPages) break; // guardrail
    } while (nextPageToken);

    // You can persist headers to Supabase here if needed.
    // For now, just return a minimal payload that your dashboard can consume.
    const summary = {
      total: collected.length,
      // Placeholders; compute actual statuses in a later pass if needed.
      due: 0,
      overdue: 0,
      snoozed: 0,
    };

    return NextResponse.json(
      {
        items: collected.map(t => ({ id: t.id, snippet: t.snippet })),
        next_cursor: null,
        summary,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'sync_failed', message }, { status: 500 });
  }
}
