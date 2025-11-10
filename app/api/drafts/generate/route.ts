// app/api/drafts/generate/route.ts
// Generates 3 follow-up drafts and enforces the free 5/month cap.
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { checkUsageLimit, recordDraftGeneratedEvent } from '@/lib/bouncer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseServer(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServer(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // Enforce limit
    const ok = await checkUsageLimit(user.id);
    if (!ok) {
      return NextResponse.json({ error: 'limit_reached', remaining: 0, upgrade: true }, { status: 402 });
    }

    // Read request
    const { threadPreview, tone } = await req.json();

    // Generate 3 drafts (placeholder; swap with your OpenAI call if you want)
    const preview = (threadPreview ?? '').toString().slice(0, 240);
    const drafts = [
      { tone: tone || 'neutral', body: `Quick bump on this. Context: ${preview}` },
      { tone: 'warm', body: `Following up kindly here. Context: ${preview}` },
      { tone: 'direct', body: `Checking status. Please advise. Context: ${preview}` },
    ];

    // Record analytics event
    await recordDraftGeneratedEvent(user.id, { source: 'dashboard' });

    // Optionally persist drafts to your drafts table here (omitted)

    return NextResponse.json({ drafts }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: 'generation_failed', message: e?.message || String(e) }, { status: 500 });
  }
}
