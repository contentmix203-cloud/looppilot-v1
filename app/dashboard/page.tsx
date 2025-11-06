// This page will be protected by middleware in the next step.
export default function Dashboard() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p>Only signed-in users should see this.</p>
      <form action="/auth/signout" method="post">
        <button className="rounded border px-3 py-2" type="submit">Sign out</button>
      </form>
    </div>
  );
}
