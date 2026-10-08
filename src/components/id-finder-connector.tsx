"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, LoaderCircle, Search, Unlink, X } from "lucide-react";
import type { IdFinderConnection, IdFinderProfile } from "@/lib/id-finder";

export function IdFinderConnector({
  companyId,
  userId,
  memberName,
  current,
  close,
  changed,
}: {
  companyId: string;
  userId: string;
  memberName: string;
  current?: IdFinderConnection;
  close: () => void;
  changed: (connection?: IdFinderConnection) => void;
}) {
  const [query, setQuery] = useState(memberName);
  const [people, setPeople] = useState<IdFinderProfile[]>([]);
  const [selected, setSelected] = useState(current?.identifier ?? "");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, close]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setPeople([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/companies/${companyId}/id-finder/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Search failed");
        setPeople(result.people ?? []);
      } catch (searchError) {
        if (!controller.signal.aborted)
          setError(
            searchError instanceof Error ? searchError.message : "Search failed",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [companyId, query]);

  async function connect() {
    if (!selected) return;
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/companies/${companyId}/members/${userId}/id-finder`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: selected }),
      },
    );
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || "Could not connect");
    changed(result.connection);
    close();
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    const response = await fetch(
      `/api/companies/${companyId}/members/${userId}/id-finder`,
      { method: "DELETE" },
    );
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || "Could not disconnect");
    changed(undefined);
    close();
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/70 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) close();
      }}
    >
      <section className="panel my-6 w-full max-w-2xl p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold">Connect with ID Finder</h2>
            <p className="mt-1 text-sm muted">
              Search the Go_Repireo directory and connect the correct ID card to {memberName}.
            </p>
          </div>
          <button disabled={busy} onClick={close} aria-label="Close">
            <X />
          </button>
        </header>

        {current && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-emerald-500/10 p-4">
            <div className="flex items-center gap-3">
              <BadgeCheck className="text-emerald-500" />
              <div>
                <b className="block text-sm">Currently connected</b>
                <span className="text-xs muted">
                  {current.fullName} · {current.identifier}
                </span>
              </div>
            </div>
            <button
              className="btn btn-secondary text-red-500"
              onClick={() => setConfirmRemove(true)}
            >
              <Unlink size={15} /> Disconnect
            </button>
          </div>
        )}

        {confirmRemove && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <b>Remove this ID Finder connection?</b>
            <p className="mt-1 muted">The employee remains in Toro; only the linked ID card is removed.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfirmRemove(false)}>Cancel</button>
              <button className="btn bg-red-600 text-white" disabled={busy} onClick={() => void disconnect()}>
                {busy ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        )}

        <label className="mt-5 block">
          <span className="label">Find a person by name, staff ID, department, or email</span>
          <span className="input flex items-center gap-2">
            <Search size={16} />
            <input
              autoFocus
              className="w-full bg-transparent outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ID Finder…"
            />
            {loading && <LoaderCircle className="animate-spin" size={16} />}
          </span>
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}

        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {people.map((person) => (
            <button
              type="button"
              key={person.id}
              onClick={() => setSelected(person.identifier)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selected === person.identifier ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-[var(--border)] hover:bg-[var(--soft)]"}`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--soft)] font-bold">
                {person.fullName[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{person.fullName}</b>
                <small className="block truncate muted">
                  {person.identifier}
                  {person.designation ? ` · ${person.designation}` : ""}
                  {person.department ? ` · ${person.department}` : ""}
                </small>
              </span>
              {selected === person.identifier && <BadgeCheck className="text-[var(--accent)]" size={19} />}
            </button>
          ))}
          {!loading && query.trim().length >= 2 && !people.length && !error && (
            <p className="p-6 text-center text-sm muted">No matching ID Finder profile</p>
          )}
        </div>
        <footer className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button className="btn btn-secondary" disabled={busy} onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !selected} onClick={() => void connect()}>
            {busy ? "Connecting…" : current ? "Update connection" : "Connect"}
          </button>
        </footer>
      </section>
    </div>
  );
}
