"use client";
import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
export type SharedTag = { id: string; name?: string; active?: boolean };
export function TagSelector({
  companyId,
  tags,
  value,
  onChange,
  canCreate = true,
}: {
  companyId: string;
  tags: SharedTag[];
  value: string[];
  onChange: (ids: string[], tags: SharedTag[]) => void;
  canCreate?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [items, setItems] = useState(tags),
    [busy, setBusy] = useState(false);
  const selected = value.map(
      (id) => items.find((tag) => tag.id === id) ?? { id, name: id },
    ),
    matches = useMemo(
      () =>
        items.filter(
          (tag) =>
            tag.active !== false &&
            String(tag.name ?? tag.id)
              .toLowerCase()
              .includes(query.toLowerCase()),
        ),
      [items, query],
    );
  const exact = items.some(
    (tag) =>
      String(tag.name ?? "").toLowerCase() === query.trim().toLowerCase(),
  );
  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
      items,
    );
  }
  async function create() {
    if (!query.trim()) return;
    setBusy(true);
    const response = await fetch(`/api/companies/${companyId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: query }),
    });
    const result = await response.json();
    setBusy(false);
    if (response.ok) {
      const next = [
        ...items.filter((item) => item.id !== result.tag.id),
        result.tag,
      ];
      setItems(next);
      onChange([...new Set([...value, result.tag.id])], next);
      setQuery("");
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        className="input flex min-h-11 flex-wrap items-center gap-1 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        {selected.length ? (
          selected.map((tag) => (
            <span
              key={tag.id}
              className="flex items-center gap-1 rounded-md bg-[var(--soft)] px-2 py-1 text-xs"
            >
              {tag.name ?? tag.id}
              <X
                size={12}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(tag.id);
                }}
              />
            </span>
          ))
        ) : (
          <span className="muted">Add tags…</span>
        )}
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-full min-w-64 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3">
            <Search size={14} />
            <input
              autoFocus
              className="w-full bg-transparent py-2 outline-none"
              placeholder="Search tags…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto">
            {matches.map((tag) => (
              <button
                type="button"
                key={tag.id}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--soft)]"
                onClick={() => toggle(tag.id)}
              >
                <span>{tag.name ?? tag.id}</span>
                {value.includes(tag.id) && <Check size={15} />}
              </button>
            ))}
            {canCreate && query.trim() && !exact && (
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--soft)]"
                onClick={() => void create()}
              >
                <Plus size={15} />
                Create “{query.trim()}”
              </button>
            )}
          </div>
          <button
            type="button"
            className="mt-2 w-full text-center text-xs muted"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
