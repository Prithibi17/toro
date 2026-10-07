export default function WorkspaceLoading() {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="Loading workspace">
      <div className="h-9 w-52 rounded-lg bg-[var(--soft)]" />
      <div className="flex gap-3">
        <div className="h-11 w-28 rounded-xl bg-[var(--soft)]" />
        <div className="h-11 max-w-xl flex-1 rounded-xl bg-[var(--soft)]" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-44 rounded-2xl bg-[var(--soft)]" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
