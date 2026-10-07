"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { TagSelector, type SharedTag } from "./tag-selector";
import { WorkspaceEntityInput } from "./workspace-entity-input";
import { cachedJson, invalidateClientCache } from "@/lib/client-api-cache";
type E = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  creatorId?: string;
  relatedType?: string;
  relatedId?: string;
  tags?: string[];
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
  const searchParams = useSearchParams();
  const loadGeneration = useRef(0);
  const relatedId = searchParams.get("relatedId");
  const [date, setDate] = useState(new Date()),
    [view, setView] = useState<View>("week"),
    [events, setEvents] = useState<E[]>([]),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [tags, setTags] = useState<SharedTag[]>([]),
    [eventTags, setEventTags] = useState<string[]>([]),
    [open, setOpen] = useState<{ start: Date; end: Date } | null>(null),
    [selectedEvent, setSelectedEvent] = useState<E | null>(null),
    [error, setError] = useState(""),
    [mine, setMine] = useState(true),
    [activities, setActivities] = useState(true);
  const from =
      view === "month"
        ? new Date(date.getFullYear(), date.getMonth(), 1)
        : view === "day" ? day(date) : week(date),
    to =
      view === "month"
        ? new Date(date.getFullYear(), date.getMonth() + 1, 7)
        : add(from, view === "day" ? 1 : 7);
  const fromIso = from.toISOString(),
    toIso = to.toISOString();
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try {
      const j = await cachedJson<{ events: E[] }>(
        `/api/companies/${companyId}/calendar?from=${fromIso}&to=${toIso}`,
      );
      if (generation !== loadGeneration.current) return;
      setEvents(j.events ?? []);
      setError("");
    } catch (cause) {
      if (generation === loadGeneration.current)
        setError(cause instanceof Error ? cause.message : "Could not load calendar");
    }
    if (generation === loadGeneration.current) setLoading(false);
  }, [companyId, fromIso, toIso]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    fetch(`/api/companies/${companyId}/tags`)
      .then((response) => (response.ok ? response.json() : { tags: [] }))
      .then((payload) => setTags(payload.tags ?? []))
      .catch(() => setTags([]));
  }, [companyId]);
  const visible = useMemo(
    () =>
      events.filter(
        (e) =>
          (!mine || !e.creatorId || e.creatorId === userId) &&
          (!relatedId || e.relatedId === relatedId) &&
          (activities || !e.relatedType) &&
          (!query || (() => {
            const tagNames = (e.tags ?? [])
              .map((id) => tags.find((tag) => tag.id === id)?.name ?? id)
              .join(" ");
            return `${JSON.stringify(e)} ${tagNames}`
              .toLowerCase()
              .includes(query.toLowerCase());
          })()),
      ),
    [events, mine, activities, query, userId, relatedId, tags],
  );
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!open) return;
    const body = {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      start: open.start.toISOString(),
      end: open.end.toISOString(),
      tags: eventTags,
    };
    const r = await fetch(`/api/companies/${companyId}/calendar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      invalidateClientCache(`/api/companies/${companyId}/calendar`);
      const result = await r.json();
      setEvents((current) => [result.event, ...current]);
      setOpen(null);
      setEventTags([]);
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
    } else invalidateClientCache(`/api/companies/${companyId}/calendar`);
  }
  async function editEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEvent) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const update = {
      title: String(values.title),
      location: String(values.location ?? ""),
      description: String(values.description ?? ""),
      tags: eventTags,
    };
    setEvents((current) =>
      current.map((item) =>
        item.id === selectedEvent.id ? { ...item, ...update } : item,
      ),
    );
    const response = await fetch(
      `/api/companies/${companyId}/calendar/${selectedEvent.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      },
    );
    if (response.ok) {
      invalidateClientCache(`/api/companies/${companyId}/calendar`);
      setSelectedEvent(null);
      setEventTags([]);
    } else {
      setError((await response.json()).error ?? "Could not update event");
      await load();
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
              setEventTags([]);
              const s = new Date(date);
              s.setHours(9, 0, 0, 0);
              setOpen({ start: s, end: new Date(s.getTime() + 3600000) });
            }}
          >
            <Plus size={16} />
            New
          </button>
          <b className="text-sm">Meetings</b>
          <WorkspaceEntityInput
            companyId={companyId}
            value={query}
            onChange={setQuery}
            placeholder="Search events, contacts, locations or tags"
            className="mx-auto min-w-64 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3"
          />
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
              edit={(event) => {
                setSelectedEvent(event);
                setEventTags(event.tags ?? []);
              }}
              select={(d) => {
                setDate(d);
                setView("day");
              }}
            />
          ) : view === "list" ? (
            <Agenda
              events={visible}
              edit={(event) => {
                setSelectedEvent(event);
                setEventTags(event.tags ?? []);
              }}
            />
          ) : (
            <Grid
              date={date}
              one={view === "day"}
              events={visible}
              create={setOpen}
              move={move}
              edit={(event) => {
                setSelectedEvent(event);
                setEventTags(event.tags ?? []);
              }}
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
            <div className="mt-3">
              <TagSelector
                companyId={companyId}
                tags={tags}
                value={eventTags}
                canCreate={false}
                onChange={(ids) => setEventTags(ids)}
              />
            </div>
            <button className="btn btn-primary mt-4 w-full">Create</button>
          </form>
        </div>
      )}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form className="panel w-full max-w-md p-5" onSubmit={editEvent}>
            <div className="flex items-center justify-between">
              <div>
                <b>Edit event</b>
                <p className="mt-1 text-xs muted">
                  {new Date(selectedEvent.start).toLocaleString()}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)}>
                <X />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="label">Title</span>
              <input className="input" name="title" required defaultValue={selectedEvent.title} />
            </label>
            <label className="mt-3 block">
              <span className="label">Location</span>
              <input className="input" name="location" defaultValue={selectedEvent.location} />
            </label>
            <label className="mt-3 block">
              <span className="label">Description</span>
              <textarea className="input min-h-24" name="description" defaultValue={String((selectedEvent as E & { description?: string }).description ?? "")} />
            </label>
            <div className="mt-3">
              <span className="label">Tags</span>
              <TagSelector
                companyId={companyId}
                tags={tags}
                value={eventTags}
                canCreate={false}
                onChange={(ids) => setEventTags(ids)}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedEvent(null)}>Cancel</button>
              <button className="btn btn-primary">Save changes</button>
            </div>
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
  edit,
}: {
  date: Date;
  one: boolean;
  events: E[];
  create: (v: { start: Date; end: Date }) => void;
  move: (id: string, d: Date) => void;
  edit: (event: E) => void;
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
                <Event key={e.id} e={e} edit={edit} />
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
                      <Event key={e.id} e={e} edit={edit} />
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
function Event({ e, edit }: { e: E; edit: (event: E) => void }) {
  const mins = Math.max(
    30,
    (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000,
  );
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      title="Open and edit event"
      onClick={() => edit(e)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") edit(e);
      }}
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
  edit,
}: {
  date: Date;
  events: E[];
  select: (d: Date) => void;
  edit: (event: E) => void;
}) {
  const first = week(new Date(date.getFullYear(), date.getMonth(), 1));
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 42 }, (_, i) => add(first, i)).map((d) => {
        const es = events.filter((e) => key(new Date(e.start)) === key(d));
        return (
          <div
            key={key(d)}
            className="min-h-28 border-b border-r border-[var(--border)] p-2 text-left"
          >
            <button type="button" className="font-bold" onClick={() => select(d)}>
              {d.getDate()}
            </button>
            {es.slice(0, 3).map((e) => (
              <button
                type="button"
                key={e.id}
                className="mt-1 truncate bg-orange-500/15 px-1 text-xs"
                onClick={(event) => {
                  event.stopPropagation();
                  edit(e);
                }}
              >
                {e.title}
              </button>
            ))}
            {es.length > 3 && (
              <p className="text-xs muted">+{es.length - 3} more</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
function Agenda({ events, edit }: { events: E[]; edit: (event: E) => void }) {
  return (
    <>
      {[...events]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((e) => (
          <div
            key={e.id}
            className="grid grid-cols-[150px_1fr] border-b border-[var(--border)] p-4"
            role="button"
            tabIndex={0}
            onClick={() => edit(e)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") edit(e);
            }}
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
