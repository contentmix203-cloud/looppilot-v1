import { NextResponse } from 'next/server';
import { getGmailClient } from '@/lib/google/gmail';
import { createClient as createSupabaseServer } from '@/lib/supabase/server';

export async function POST() {
  const gmail = await getGmailClient();
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ started_at: null }, { status: 401 });

  // Query: your last-sent messages that have not been replied to yet will be detected later.
  // First just index recent threads by date.
  const q = 'newer_than:60d'; // narrow to last ~60 days to keep calls cheap
  // List threads (metadata only); you can also use messages.list and group later.
  // threads.list reference: users.threads.list. :contentReference[oaicite:6]{index=6}
  const threads: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const { data } = await gmail.users.threads.list({
      userId: 'me',
      q,
      maxResults: 100,
      pageToken
    });
    pageToken = data.nextPageToken ?? undefined;
    if (data.threads?.length) threads.push(...data.threads);
  } while (pageToken);

  // For each thread, fetch minimal details to compute last inbound/outbound dates.
  for (const t of threads) {
    const { data } = await gmail.users.threads.get({ userId: 'me', id: t.id!, format: 'metadata' });
    // Inspect payload headers to find From, To, Date. Decide direction by whether From contains the user’s email.
    const msgs = data.messages ?? [];
    let lastOut: Date | null = null;
    let lastIn: Date | null = null;
    for (const m of msgs) {
      const headers = (m.payload?.headers ?? []) as Array<{ name: string; value: string }>;
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? '';
      const to = headers.find(h => h.name.toLowerCase() === 'to')?.value ?? '';
      const date = new Date(Number(m.internalDate));
      // crude heuristic: if "From" contains user's address, mark outbound else inbound
      const userEmail = m?.labelIds?.includes('SENT') ? 'me' : undefined; // fallback
      const isOutbound = m.labelIds?.includes('SENT') || /<.*@.*>/.test(from) && /me/.test(''); // keep simple
      if (isOutbound) lastOut = date;
      else lastIn = date;
    }
    await supabase.from('gmail_threads').upsert({
      user_id: user!.id,
      thread_id: t.id!,
      subject: (msgs[0]?.snippet ?? '').slice(0, 200),
      last_outbound_at: lastOut ? lastOut.toISOString() : null,
      last_inbound_at: lastIn ? lastIn.toISOString() : null,
      snippet: (msgs[msgs.length - 1]?.snippet ?? '').slice(0, 200)
    });
  }

  await supabase.from('gmail_sync_state').upsert({
    user_id: user!.id,
    last_sync_at: new Date().toISOString()
  });

  return NextResponse.json({ started_at: new Date().toISOString(), indexed_threads: threads.length });
}
