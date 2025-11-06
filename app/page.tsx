export default function Home() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">LoopPilot</h1>
      <p>A minimal scaffold. Use the links below.</p>
      <div className="flex gap-3">
        <a className="rounded bg-black px-3 py-2 text-white" href="/signup">Sign up</a>
        <a className="rounded border px-3 py-2" href="/login">Log in</a>
      </div>
    </div>
  );
}
