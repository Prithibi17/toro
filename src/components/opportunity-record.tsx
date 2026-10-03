"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
type Item = Record<string, unknown> & { id: string };
export function OpportunityRecord({
  companyId,
  currency,
  opportunity,
  customer,
  contact,
  stage,
  events,
  activities,
  previousId,
  nextId,
  position,
  total,
}: {
  companyId: string;
  currency: string;
  opportunity: Item;
  customer: unknown;
  contact: unknown;
  stage: unknown;
  events: Item[];
  activities: Item[];
  previousId: string | null;
  nextId: string | null;
  position: number;
  total: number;
}) {
  const router = useRouter(),
    [activity, setActivity] = useState(false),
    [error, setError] = useState("");
  const c = customer as Item | null,
    p = contact as Item | null,
    s = stage as Item | null;
  async function schedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    body.relatedType = "opportunity";
    body.relatedId = opportunity.id;
    body.dueAt = new Date(String(body.dueAt)).toISOString();
    const r = await fetch(`/api/companies/${companyId}/crm/activities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setActivity(false);
      router.refresh();
    } else setError((await r.json()).error);
  }
  const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(opportunity.value || 0));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            className="flex items-center gap-1 text-sm text-[var(--accent)]"
            href={`/workspace/${companyId}/crm`}
          >
            <ArrowLeft size={15} />
            My Pipeline
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold">
            {String(opportunity.name)}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="muted">
            {position} / {total}
          </span>
          {previousId ? (
            <Link
              className="btn btn-secondary"
              href={`/workspace/${companyId}/crm/opportunities/${previousId}`}
            >
              <ChevronLeft size={16} />
            </Link>
          ) : null}
          {nextId ? (
            <Link
              className="btn btn-secondary"
              href={`/workspace/${companyId}/crm/opportunities/${nextId}`}
            >
              <ChevronRight size={16} />
            </Link>
          ) : null}
        </div>
      </div>
      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <main className="space-y-5">
          <section className="panel p-6">
            <div className="mb-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-bold text-white">
                {String(s?.name ?? opportunity.status ?? "Open")}
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => setActivity(true)}
              >
                <CalendarClock size={16} />
                Activity
              </button>
            </div>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Data label="Expected revenue" value={money} />
              <Data
                label="Probability"
                value={`${Number(opportunity.probability || 0)}%`}
              />
              <Data
                label="Customer"
                value={
                  c ? (
                    <Link
                      className="text-[var(--accent)]"
                      href={`/workspace/${companyId}/contacts/${c.id}`}
                    >
                      {String(c.title ?? c.name)}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Data
                label="Primary contact"
                value={p ? String(p.title ?? p.name) : "—"}
              />
              <Data
                label="Expected closing"
                value={String(opportunity.expectedCloseDate || "—")}
              />
              <Data
                label="Priority"
                value={String(opportunity.priority || "medium")}
              />
              <Data label="Source" value={String(opportunity.source || "—")} />
              <Data
                label="Next activity"
                value={String(opportunity.nextActivityTitle || "Not scheduled")}
              />
            </div>
          </section>
          <section className="panel p-6">
            <h2 className="font-bold">Details</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm muted">
              {String(opportunity.description || "No details added.")}
            </p>
          </section>
        </main>
        <aside className="panel p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-bold">Chatter</h2>
            <button
              className="text-sm font-semibold text-[var(--accent)]"
              onClick={() => setActivity(true)}
            >
              Activity
            </button>
          </div>
          <div className="space-y-3">
            {[...activities, ...events]
              .sort((a, b) =>
                String(b.createdAt ?? b.timestamp).localeCompare(
                  String(a.createdAt ?? a.timestamp),
                ),
              )
              .map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl bg-[var(--soft)] p-3"
                >
                  <p className="font-semibold capitalize">
                    {String(
                      item.title ?? item.eventType ?? item.type ?? "Update",
                    ).replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-sm muted">
                    {String(item.description ?? item.outcome ?? "")}
                  </p>
                  <p className="mt-2 text-xs muted">
                    {item.dueAt
                      ? new Date(String(item.dueAt)).toLocaleString()
                      : item.timestamp
                        ? new Date(String(item.timestamp)).toLocaleString()
                        : ""}
                  </p>
                </article>
              ))}
            {!activities.length && !events.length ? (
              <p className="text-sm muted">No activity yet.</p>
            ) : null}
          </div>
        </aside>
      </div>
      {activity ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form className="panel w-full max-w-lg p-6" onSubmit={schedule}>
            <div className="mb-5 flex justify-between">
              <h2 className="text-xl font-extrabold">Schedule activity</h2>
              <button type="button" onClick={() => setActivity(false)}>
                <X />
              </button>
            </div>
            <div className="space-y-4">
              <label>
                <span className="label">Type</span>
                <select className="input" name="type">
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="follow-up">Follow-up</option>
                  <option value="task">Task</option>
                </select>
              </label>
              <label>
                <span className="label">Summary</span>
                <input className="input" name="title" required />
              </label>
              <label>
                <span className="label">Due</span>
                <input
                  className="input"
                  name="dueAt"
                  type="datetime-local"
                  required
                />
              </label>
              <label>
                <span className="label">Notes</span>
                <textarea className="input min-h-20" name="description" />
              </label>
            </div>
            <button className="btn btn-primary mt-5 w-full">Schedule</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
function Data({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider muted">
        {label}
      </p>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
