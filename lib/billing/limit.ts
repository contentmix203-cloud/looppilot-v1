// lib/billing/limit.ts
// Enforce: free users can generate at most 5 drafts per calendar month (UTC).

import type { SupabaseClient } from '@supabase/supabase-js';

export type LimitCheck = {
  ok: boolean;              // true = allowed, false = block
  plan: 'free' | 'pro';     // inferred plan
  usedThisMonth: number;    // # of draft_generated events this month
  remaining?: number;       // only for free; remaining before hitting 5
};

function currentMonthBoundsUTC() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: next.toISOString() };
}

/**
 * Returns { ok:false } if the user is on 'free' and has >=5 draft_generated this month.
 * Otherwise { ok:true }.
 * - Reads profiles.plan
 * - Counts analytics_events where event_type='draft_generated' in current month (UTC)
 */
export async function checkUsageLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<LimitCheck> {
  // 1) Fetch plan
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();

  if (profErr) {
    // Fail-open for safety in dev. In prod you may want to fail-closed.
    return { ok: true, plan: 'free', usedThisMonth: 0 };
  }

  const plan = (profile?.plan === 'pro') ? 'pro' : 'free';
  if (plan === 'pro') {
    return { ok: true, plan, usedThisMonth: 0 };
  }

  // 2) Count this month's draft_generated events
  const { startISO, endISO } = currentMonthBoundsUTC();

  const { count, error: cntErr } = await supabase
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'draft_generated')
    .gte('created_at', startISO)
    .lt('created_at', endISO);

  const used = cntErr ? 0 : (count ?? 0);

  if (used >= 5) {
    return { ok: false, plan, usedThisMonth: used, remaining: 0 };
  }

  return { ok: true, plan, usedThisMonth: used, remaining: 5 - used - 0 };
}

/**
 * Optional helper to record a successful generation into analytics_events.
 * Call this *after* you create the drafts.
 */
export async function recordDraftGenerated(
  supabase: SupabaseClient,
  userId: string,
  meta?: Record<string, any>
) {
  await supabase.from('analytics_events').insert({
    user_id: userId,
    event_type: 'draft_generated',
    metadata: meta ?? null,
  });
}
