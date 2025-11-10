import { NextResponse } from 'next/server';
import { createClient as createSupabaseServer } from '@/lib/supabase/server';

function daysBetween(a: string | null, b: string) {
  if (!a) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(ms / (1000*60*60*24));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minDays = Number(url.searchParams.get('minDays') ?? 3);
  const maxDays = Number(url.searchParams.get('maxDays') ?? 7);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [], next_cursor: null }, { status: 401 });

  // pull recent indexed threads
  const { data: rows } = await supabase
    .from('gmail_threads')
    .select('*')
    .eq('user_id', user.id);

  const nowIso = new Date().toISOString();
  const items = (rows ?? []).map(r => {
    const daysSinceOut = daysBetween(r.last_outbound_at, nowIso);
    const daysSinceIn  = daysBetween(r.last_inbound_at,  nowIso);
    const userLast = (r.last_outbound_at && (!r.last_inbound_at || r.last_outbound_at > r.last_inbound_at));
    const due = userLast && daysSinceOut !== null && daysSinceOut >= minDays && daysSinceOut <= maxDays;
    const overdue = userLast && daysSinceOut !== null && daysSinceOut > maxDays;
    return {
      thread_id: r.thread_id,
      subject: r.subject,
      last_outbound_at: r.last_outbound_at,
      last_inbound_at: r.last_inbound_at,
      days_since: daysSinceOut ?? null,
      status: overdue ? 'overdue' : (due ? 'due' : 'ok'),
      source: 'inbox' as const
    };
  }).filter(x => x.status === 'due' || x.status === 'overdue')
    // sort by most overdue
    .sort((a,b) => (b.days_since ?? 0) - (a.days_since ?? 0));

  return NextResponse.json({
    items,
    next_cursor: null,
    summary: {
      total: items.length,
      due: items.filter(i => i.status==='due').length,
      overdue: items.filter(i => i.status==='overdue').length,
      snoozed: 0
    }
  });
}
