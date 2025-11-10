'use client';

import { useEffect, useState } from 'react';

type InboxStatus = {
  provider: 'gmail';
  connected: boolean;
  last_sync_at: string | null;
  error: null | { code: string; message: string };
};

type OpenLoopRow = {
  thread_id: string;
  subject: string | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  days_since: number | null;
  status: 'due' | 'overdue' | 'ok';
  source: 'inbox';
};

export default function Dashboard() {
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OpenLoopRow[]>([]);
  const [syncing, setSyncing] = useState(false);

  // 1) On first load, check connection status
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/inbox/status');
      const json = await res.json();
      setStatus(json);
    })();
  }, []);

  // 2) If connected and needs sync, start it, then load rows
  useEffect(() => {
    const needsSync = status?.connected && !status.last_sync_at;
    if (needsSync) {
      (async () => {
        setSyncing(true);
        await fetch('/api/sync/headers', { method: 'POST' });
        setSyncing(false);
        loadRows();
      })();
    } else if (status?.connected) {
      loadRows();
    }
  }, [status]);

  async function connectGmail() {
    setLoading(true);
    const res = await fetch('/api/auth/google/url');
    const { authorize_url } = await res.json();
    // open Google’s consent screen
    window.location.href = authorize_url;
  }

  async function loadRows() {
    const res = await fetch('/api/threads/find?minDays=3&maxDays=7');
    const json = await res.json();
    setRows(json.items || []);
  }

  async function manualSync() {
    setSyncing(true);
    await fetch('/api/sync/headers', { method: 'POST' });
    setSyncing(false);
    await loadRows();
  }

  // Simple UI
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {!status?.connected ? (
        <button
          onClick={connectGmail}
          className="rounded bg-black px-4 py-2 text-white"
          disabled={loading}
        >
          {loading ? 'Opening Google…' : 'Connect Gmail'}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm">Gmail connected</span>
          <button
            onClick={manualSync}
            className="rounded border px-3 py-2 text-sm"
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      )}

      <div className="border rounded">
        <div className="grid grid-cols-5 gap-2 border-b p-2 text-sm font-medium">
          <div>Subject</div>
          <div>Last outbound</div>
          <div>Last inbound</div>
          <div>Days since</div>
          <div>Status</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-3 text-sm text-gray-600">No open loops yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.thread_id} className="grid grid-cols-5 gap-2 border-b p-2 text-sm">
              <div className="truncate">{r.subject || '(no subject)'}</div>
              <div>{r.last_outbound_at ? new Date(r.last_outbound_at).toLocaleString() : '-'}</div>
              <div>{r.last_inbound_at ? new Date(r.last_inbound_at).toLocaleString() : '-'}</div>
              <div>{r.days_since ?? '-'}</div>
              <div className={r.status === 'overdue' ? 'text-red-600' : r.status === 'due' ? 'text-amber-600' : ''}>
                {r.status}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
