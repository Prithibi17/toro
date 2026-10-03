"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
type E = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  creatorId?: string;
  relatedType?: string;
};
type View = "week" | "day" | "month" | "list";
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
  add = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  },
  week = (d: Date) => add(day(d), -d.getDay()),
  key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
export function CalendarWorkspace({
  companyId,
  userId,
  userName,
}: {
  companyId: string;
  userId: string;
  userName: string;
}) {
  const [date, setDate] = useState(new Date()),
    [view, setView] = useState<View>("week"),
    [events, setEvents] = useState<E[]>([]),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState<{ start: Date; end: Date } | null>(null),
    [error, setError] = useState(""),
    [mine, setMine] = useState(true),
    [activities, setActivities] = useState(true);
  const from =
      view === "month"
        ? new Date(date.getFullYear(), date.getMonth(), 1)
        : week(date),
    to =
      view === "month"
        ? new Date(date.getFullYear(), date.getMonth() + 1, 7)
        : add(from, view === "day" ? 1 : 7);
  const fromIso = from.toISOString(),
    toIso = to.toISOString();
  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(
        `/api/companies/${companyId}/calendar?from=${fromIso}&to=${toIso}`,
      ),
      j = await r.json();
    if (r.ok) setEvents(j.events ?? []);
    else setError(j.error);
    setLoading(false);
  }, [companyId, fromIso, toIso]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          (!mine || !e.creatorId || e.creatorId === userId) &&
          (activities || !e.relatedType) &&
          (!query ||
            JSON.stringify(e).toLowerCase().includes(query.toLowerCase())),
      ),
    [events, mine, activities, query, userId],
  );
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!open) return;
    const body = {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      start: open.start.toISOString(),
      end: open.end.toISOString(),
    };
    const r = await fetch(`/api/companies/${companyId}/calendar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const result = await r.json();
      setEvents((current) => [result.event, ...current]);
      setOpen(null);
    } else setError((await r.json()).error);
  }
  async function move(id: string, target: Date) {
    const old = events.find((e) => e.id === id);
    if (!old) return;
    const duration =
      new Date(old.end).getTime() - new Date(old.start).getTime();
    const next = {
      start: target.toISOString(),
      end: new Date(target.getTime() + duration).toISOString(),
    };
    setEvents((current) =>
      current.map((event) => (event.id === id ? { ...event, ...next } : event)),
    );
    const r = await fetch(`/api/companies/${companyId}/calendar/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!r.ok) {
      setEvents((current) =>
        current.map((event) => (event.id === id ? old : event)),
      );
      setError((await r.json()).error);
    }
  }
  return (
    <div className="-m-4 sm:-m-6 lg:-m-8">
      <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <h1 className="mr-2 text-lg font-extrabold">Calendar</h1>
          <button
            className="btn btn-primary !py-2"
            onClick={() => {
              const s = new Date(date);
              s.setHours(9, 0, 0, 0);
              setOpen({ start: s, end: new Date(s.getTime() + 3600000) });
            }}
          >
            <Plus size={16} />
            New
          </button>
          <b className="text-sm">Meetings</b>
          <div className="mx-auto flex min-w-64 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3">
            <Search size={15} />
            <input
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder="Search events, contacts, locations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className={`btn !py-2 ${view !== "list" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setView("week")}
          >
            <CalendarDays size={16} />
            Calendar
          </button>
          <button
            className={`btn !py-2 ${view === "list" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setView("list")}
          >
            <List size={16} />
            List
          </button>
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-2">
          <button
            className="btn btn-secondary !p-2"
            onClick={() =>
              setDate((d) =>
                add(d, view === "day" ? -1 : view === "month" ? -30 : -7),
              )
            }
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="btn btn-secondary !p-2"
            onClick={() =>
              setDate((d) =>
                add(d, view === "day" ? 1 : view === "month" ? 30 : 7),
              )
            }
          >
            <ChevronRight size={16} />
          </button>
          <select
            className="input !w-auto !py-2"
            value={view === "list" ? "week" : view}
            onChange={(e) => setView(e.target.value as View)}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
          <button
            className="btn btn-secondary !py-2"
            onClick={() => setDate(new Date())}
          >
            Today
          </button>
          <b className="ml-2">
            {date.toLocaleString(undefined, { month: "long", year: "numeric" })}
          </b>
        </div>
      </div>
      {error && (
        <p className="bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</p>
      )}
      <div className="grid min-h-[calc(100vh-190px)] lg:grid-cols-[minmax(0,1fr)_260px]">
        <main className="min-w-0 border-r border-[var(--border)]">
          {loading ? (
            <div className="grid min-h-96 place-items-center">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : view === "month" ? (
            <Month
              date={date}
              events={visible}
              select={(d) => {
                setDate(d);
                setView("day");
              }}
            />
          ) : view === "list" ? (
            <Agenda events={visible} />
          ) : (
            <Grid
              date={date}
              one={view === "day"}
              events={visible}
              create={setOpen}
              move={move}
            />
          )}
        </main>
        <aside className="sticky top-28 hidden h-[calc(100vh-112px)] overflow-y-auto p-4 lg:block">
          <Mini date={date} select={setDate} />
          <h2 className="mt-6 border-t border-[var(--border)] pt-4 text-xs font-bold uppercase muted">
            Calendars
          </h2>
          <label className="mt-3 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
            />
            <i className="mt-1 h-2.5 w-2.5 rounded-sm bg-orange-500" />
            {userName}
          </label>
          <h2 className="mt-6 border-t border-[var(--border)] pt-4 text-xs font-bold uppercase muted">
            My Activities
          </h2>
          <label className="mt-3 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={activities}
              onChange={(e) => setActivities(e.target.checked)}
            />
            Show activities
          </label>
          <button
            className="btn btn-secondary mt-6 w-full !py-2"
            onClick={() =>
              setError(
                "Calendar integration is not configured. Configure Google or Outlook in company settings.",
              )
            }
          >
            Synchronize
          </button>
        </aside>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form className="panel w-full max-w-md p-5" onSubmit={create}>
            <div className="flex justify-between">
              <b>New Event</b>
              <button type="button" onClick={() => setOpen(null)}>
                <X />
              </button>
            </div>
            <p className="mt-2 text-sm muted">
              {open.start.toLocaleString()} – {open.end.toLocaleTimeString()}
            </p>
            <input
              className="input mt-4"
              name="title"
              placeholder="Title"
              required
              autoFocus
            />
            <input
              className="input mt-3"
              name="location"
              placeholder="Location"
            />
            <button className="btn btn-primary mt-4 w-full">Create</button>
          </form>
        </div>
      )}
    </div>
  );
}
function Grid({
  date,
  one,
  events,
  create,
  move,
}: {
  date: Date;
  one: boolean;
  events: E[];
  create: (v: { start: Date; end: Date }) => void;
  move: (id: string, d: Date) => void;
}) {
  const start = one ? day(date) : week(date),
    days = Array.from({ length: one ? 1 : 7 }, (_, i) => add(start, i)),
    hours = Array.from({ length: 14 }, (_, i) => i + 6),
    cols = one
      ? "grid-cols-[58px_1fr]"
      : "grid-cols-[58px_repeat(7,minmax(100px,1fr))]";
  return (
    <div className="min-w-[760px]">
      <div className={`grid border-b border-[var(--border)] ${cols}`}>
        <div />
        {days.map((d) => (
          <div
            key={key(d)}
            className="border-l border-[var(--border)] py-2 text-center"
          >
            <p className="text-xs font-bold uppercase muted">
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </p>
            <p
              className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-sm ${key(d) === key(new Date()) ? "bg-[var(--accent)] text-white" : ""}`}
            >
              {d.getDate()}
            </p>
          </div>
        ))}
      </div>
      <div className={`grid border-b border-[var(--border)] ${cols}`}>
        <span className="p-2 text-[10px] muted">ALL DAY</span>
        {days.map((d) => (
          <div
            key={key(d)}
            className="min-h-10 border-l border-[var(--border)] p-1"
          >
            {events
              .filter((e) => e.allDay && key(new Date(e.start)) === key(d))
              .map((e) => (
                <Event key={e.id} e={e} />
              ))}
          </div>
        ))}
      </div>
      <div className="max-h-[calc(100vh-265px)] overflow-y-auto">
        {hours.map((h) => (
          <div key={h} className={`grid min-h-16 ${cols}`}>
            <span className="-mt-2 pr-2 text-right text-[10px] muted">
              {new Date(2020, 0, 1, h).toLocaleTimeString([], {
                hour: "numeric",
              })}
            </span>
            {days.map((d) => {
              const slot = new Date(d);
              slot.setHours(h, 0, 0, 0);
              return (
                <div
                  key={key(d)}
                  className="border-l border-t border-[var(--border)] p-1"
                  onDoubleClick={() =>
                    create({
                      start: slot,
                      end: new Date(slot.getTime() + 3600000),
                    })
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) void move(id, slot);
                  }}
                >
                  {events
                    .filter(
                      (e) =>
                        !e.allDay &&
                        key(new Date(e.start)) === key(d) &&
                        new Date(e.start).getHours() === h,
                    )
                    .map((e) => (
                      <Event key={e.id} e={e} />
                    ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
function Event({ e }: { e: E }) {
  const mins = Math.max(
    30,
    (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000,
  );
  return (
    <div
      draggable
      onDragStart={(x) => x.dataTransfer.setData("text/plain", e.id)}
      className="mb-1 overflow-hidden rounded-md border-l-2 border-orange-500 bg-orange-500/15 px-2 py-1 text-xs"
      style={{ minHeight: Math.min(120, Math.max(26, mins)) }}
    >
      <b>
        {new Date(e.start).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        {e.title}
      </b>
      {e.location && <p className="truncate muted">{e.location}</p>}
    </div>
  );
}
function Month({
  date,
  events,
  select,
}: {
  date: Date;
  events: E[];
  select: (d: Date) => void;
}) {
  const first = week(new Date(date.getFullYear(), date.getMonth(), 1));
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 42 }, (_, i) => add(first, i)).map((d) => {
        const es = events.filter((e) => key(new Date(e.start)) === key(d));
        return (
          <button
            key={key(d)}
            onClick={() => select(d)}
            className="min-h-28 border-b border-r border-[var(--border)] p-2 text-left"
          >
            <b>{d.getDate()}</b>
            {es.slice(0, 3).map((e) => (
              <p
                key={e.id}
                className="mt-1 truncate bg-orange-500/15 px-1 text-xs"
              >
                {e.title}
              </p>
            ))}
            {es.length > 3 && (
              <p className="text-xs muted">+{es.length - 3} more</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
function Agenda({ events }: { events: E[] }) {
  return (
    <>
      {[...events]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((e) => (
          <div
            key={e.id}
            className="grid grid-cols-[150px_1fr] border-b border-[var(--border)] p-4"
          >
            <span className="text-sm muted">
              {new Date(e.start).toLocaleString()}
            </span>
            <div>
              <b>{e.title}</b>
              <p className="text-sm muted">{e.location || "—"}</p>
            </div>
          </div>
        ))}
    </>
  );
}
function Mini({ date, select }: { date: Date; select: (d: Date) => void }) {
  const first = week(new Date(date.getFullYear(), date.getMonth(), 1));
  return (
    <section>
      <b>
        {date.toLocaleString(undefined, { month: "long", year: "numeric" })}
      </b>
      <div className="mt-3 grid grid-cols-7 text-center text-xs">
        {"SMTWTFS".split("").map((x, i) => (
          <b key={i} className="py-1 muted">
            {x}
          </b>
        ))}
        {Array.from({ length: 42 }, (_, i) => add(first, i)).map((d) => (
          <button
            key={key(d)}
            onClick={() => select(d)}
            className={`grid h-7 place-items-center rounded-full ${key(d) === key(date) ? "bg-[var(--accent)] text-white" : d.getMonth() !== date.getMonth() ? "opacity-35" : ""}`}
          >
            {d.getDate()}
          </button>
        ))}
      </div>
    </section>
  );
}
