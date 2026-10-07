"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ChevronDown,
  CirclePlus,
  LoaderCircle,
  Search,
} from "lucide-react";
type Task = {
  id: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  stageId: string;
  completedAt?: string;
  assignee?: { id: string; displayName: string; status?: string } | null;
};
type Stage = {
  id: string;
  name: string;
  sequence: number;
  isDone?: boolean;
  isFolded?: boolean;
};
export function TaskBoard({ companyId }: { companyId: string }) {
  const router = useRouter(),
    [tasks, setTasks] = useState<Task[]>([]),
    [stages, setStages] = useState<Stage[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [view, setView] = useState("assigned"),
    [adding, setAdding] = useState<string | null>(null),
    [newStage, setNewStage] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/companies/${companyId}/tasks?view=${view}`),
      j = await r.json();
    if (r.ok) {
      setTasks(j.tasks ?? []);
      setStages(j.stages ?? []);
    } else setError(j.error);
    setLoading(false);
  }, [companyId, view]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      tasks.filter((t) =>
        (t.title + " " + (t.description || ""))
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [tasks, query],
  );
  async function create(e: React.FormEvent<HTMLFormElement>, stageId: string) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    body.stageId = stageId;
    const r = await fetch(`/api/companies/${companyId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const result = await r.json();
      setTasks((current) => [result.task, ...current]);
      setAdding(null);
    } else setError((await r.json()).error);
  }
  async function move(id: string, stageId: string) {
    const before = tasks;
    setTasks((x) => x.map((t) => (t.id === id ? { ...t, stageId } : t)));
    const r = await fetch(`/api/companies/${companyId}/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    if (!r.ok) {
      setTasks(before);
      setError((await r.json()).error);
    }
  }
  async function addStage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await fetch(`/api/companies/${companyId}/todo-stages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    if (r.ok) {
      const result = await r.json();
      setStages((current) => [...current, result.stage]);
      setNewStage(false);
    } else setError((await r.json()).error);
  }
  const overdue = (t: Task) =>
    Boolean(
      t.dueDate &&
      !t.completedAt &&
      new Date(t.dueDate) < new Date(new Date().toDateString()),
    );
  return (
    <>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold">My To-Do</h1>
          <button
            className="btn btn-primary !py-2"
            onClick={() => setAdding(stages[0]?.id ?? null)}
          >
            <CirclePlus size={16} />
            New
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input !w-auto !py-2"
            aria-label="To-Do view"
            value={view}
            onChange={(event) => setView(event.target.value)}
          >
            <option value="assigned">My To-Do</option>
            <option value="created">Created by Me</option>
            <option value="assigned-by-me">Assigned by Me</option>
            <option value="all">All To-Dos</option>
          </select>
          <div className="flex min-w-64 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3">
            <Search size={16} />
            <input
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              placeholder="Search To-Dos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </header>
      {error && (
        <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </p>
      )}
      {loading ? (
        <div className="grid min-h-80 place-items-center">
          <LoaderCircle className="animate-spin" />
        </div>
      ) : (
        <div className="flex min-h-[70vh] gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <section
              key={stage.id}
              className="w-80 shrink-0 bg-[var(--soft)] p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) void move(id, stage.id);
              }}
            >
              <header className="mb-3 flex items-center justify-between px-1">
                <b className="uppercase text-sm">{stage.name}</b>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--panel)] px-2 text-xs">
                    {visible.filter((t) => t.stageId === stage.id).length}
                  </span>
                  <ChevronDown size={15} className="muted" />
                </div>
              </header>
              <div className="space-y-2">
                {visible
                  .filter((t) => t.stageId === stage.id)
                  .map((t) => (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", t.id)
                      }
                      onClick={() =>
                        router.push(`/workspace/${companyId}/todo/${t.id}`)
                      }
                      onPointerEnter={() =>
                        router.prefetch(`/workspace/${companyId}/todo/${t.id}`)
                      }
                      className="panel cursor-pointer p-4"
                    >
                      <div className="flex justify-between gap-2">
                        <b>{t.title}</b>
                        <i
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.priority === "urgent" ? "bg-red-500" : t.priority === "high" ? "bg-orange-500" : "bg-slate-400"}`}
                        />
                      </div>
                      {t.description && (
                        <p className="mt-2 line-clamp-2 text-sm muted">
                          {t.description}
                        </p>
                      )}
                      {t.dueDate && (
                        <p
                          className={`mt-3 flex items-center gap-1 text-xs ${overdue(t) ? "text-red-500" : "muted"}`}
                        >
                          <Calendar size={13} />
                          {overdue(t) ? "Overdue · " : ""}
                          {t.dueDate}
                        </p>
                      )}
                      {t.assignee && (
                        <div
                          className="mt-3 flex justify-end"
                          title={
                            t.assignee.status === "active"
                              ? t.assignee.displayName
                              : `${t.assignee.displayName} / unavailable`
                          }
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--soft)] text-xs font-bold">
                            {t.assignee.displayName
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")
                              .toUpperCase()}
                          </span>
                        </div>
                      )}
                    </article>
                  ))}
                {adding === stage.id ? (
                  <form
                    className="panel p-3"
                    onSubmit={(e) => create(e, stage.id)}
                  >
                    <input
                      className="input !py-2"
                      name="title"
                      autoFocus
                      placeholder="What needs to be done?"
                      required
                    />
                    <div className="mt-2 flex gap-2">
                      <button className="btn btn-primary !py-1.5">Add</button>
                      <button
                        type="button"
                        className="btn btn-secondary !py-1.5"
                        onClick={() => setAdding(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="w-full border border-dashed border-[var(--border)] p-3 text-sm font-semibold muted"
                    onClick={() => setAdding(stage.id)}
                  >
                    + Add
                  </button>
                )}
              </div>
            </section>
          ))}
          <section className="w-72 shrink-0">
            {newStage ? (
              <form className="panel p-3" onSubmit={addStage}>
                <input
                  className="input"
                  name="name"
                  autoFocus
                  placeholder="Stage name"
                  required
                />
                <button className="btn btn-primary mt-2">Add Stage</button>
              </form>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={() => setNewStage(true)}
              >
                + Personal Stage
              </button>
            )}
          </section>
        </div>
      )}
    </>
  );
}
