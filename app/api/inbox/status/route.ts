import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      provider: 'gmail',
      connected: false,
      last_sync_at: null,
      error: null,
    });
  }

  const { data: tokens } = await supabase
    .from('google_oauth_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: sync } = await supabase
    .from('gmail_sync_state')
    .select('last_sync_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    provider: 'gmail',
    connected: !!tokens,
    last_sync_at: sync?.last_sync_at ?? null,
    error: null,
  });
}
