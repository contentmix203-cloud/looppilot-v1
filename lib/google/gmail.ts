import { google } from 'googleapis';
import { refreshAccessToken } from './tokens';
import { createClient as createSupabaseServer } from '@/lib/supabase/server';

export async function getGmailClient() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('no_user');

  const { data: tokenRow, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (error || !tokenRow) throw new Error('no_tokens');

  let { access_token, refresh_token, expiry_ts } = tokenRow as {
    access_token: string; refresh_token: string; expiry_ts: string;
  };

  // Refresh if expired or expiring within 2 minutes
  if (!expiry_ts || new Date(expiry_ts).getTime() - Date.now() < 120000) {
    if (!refresh_token) throw new Error('no_refresh_token');
    const refreshed = await refreshAccessToken(refresh_token);
    access_token = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    await supabase.from('google_oauth_tokens').update({
      access_token, expiry_ts: newExpiry
    }).eq('user_id', user.id);
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token });
  return google.gmail({ version: 'v1', auth });
}
