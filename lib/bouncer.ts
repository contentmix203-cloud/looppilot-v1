// lib/bouncer.ts
// Server-only. Enforces: free users can generate at most 5 drafts per calendar month (UTC).
import { createClient } from '@supabase/supabase-js';

function monthBoundsUTC() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const next  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: next.toISOString() };
}

/** true = allowed, false = block */
export async function checkUsageLimit(userId: string): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return true;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_tier')
    .eq('id', userId)
    .single();

  const tier = (profile?.plan_tier ?? 'free') as 'free' | 'pro_weekly' | 'pro_monthly';
  if (tier === 'pro_weekly' || tier === 'pro_monthly') return true;

  // Count this month’s drafts
  const { startISO, endISO } = monthBoundsUTC();
  const { count } = await supabase
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'draft_generated')
    .gte('created_at', startISO)
    .lt('created_at', endISO);

  const used = count ?? 0;
  return used < 5;
}

/** Optional: record after a successful generation */
export async function recordDraftGeneratedEvent(userId: string, meta?: Record<string, any>) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  await supabase.from('analytics_events').insert({
    user_id: userId,
    event_type: 'draft_generated',
    metadata: meta ?? null,
  });
}
