"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Archive,
  CalendarClock,
  CheckCircle2,
  X,
} from "lucide-react";
type I = Record<string, unknown> & { id: string };
export function TodoRecord({
  companyId,
  task,
  stages,
  history,
}: {
  companyId: string;
  task: I;
  stages: I[];
  history: I[];
}) {
  const router = useRouter(),
    [record, setRecord] = useState(task),
    [timeline, setTimeline] = useState(history),
    [activity, setActivity] = useState(false),
    [error, setError] = useState("");
  const current = stages.find((s) => s.id === record.stageId),
    done = Boolean(record.completedAt) || Boolean(current?.isDone);
  async function update(body: Record<string, unknown>) {
    const previous = record;
    const selectedStage = body.stageId
      ? stages.find((stage) => stage.id === body.stageId)
      : undefined;
    const optimistic = {
      ...record,
      ...body,
      ...(selectedStage
        ? {
            completedAt: selectedStage.isDone ? new Date().toISOString() : null,
          }
        : {}),
    };
    setRecord(optimistic);
    setError("");
    const r = await fetch(`/api/companies/${companyId}/tasks/${record.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setTimeline((currentHistory) => [
        {
          id: `local-${Date.now()}`,
          eventType: body.archived
            ? "archived"
            : body.stageId
              ? "stage_changed"
              : "updated",
          timestamp: new Date().toISOString(),
        },
        ...currentHistory,
      ]);
      if (body.archived) router.push(`/workspace/${companyId}/todo`);
    } else {
      setRecord(previous);
      setError((await r.json()).error);
    }
  }
  async function schedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(
      new FormData(e.currentTarget),
    );
    body.relatedType = "task";
    body.relatedId = record.id;
    body.dueAt = new Date(String(body.dueAt)).toISOString();
    const r = await fetch(`/api/companies/${companyId}/crm/activities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setActivity(false);
      setTimeline((currentHistory) => [
        {
          id: `activity-${Date.now()}`,
          eventType: "activity_scheduled",
          timestamp: new Date().toISOString(),
        },
        ...currentHistory,
      ]);
    } else setError((await r.json()).error);
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap justify-between gap-3">
        <div>
          <Link
            href={`/workspace/${companyId}/todo`}
            className="flex items-center gap-1 text-sm text-[var(--accent)]"
          >
            <ArrowLeft size={15} />
            My To-Do
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold">
            {String(record.title)}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            onClick={() =>
              update({
                stageId: (done
                  ? stages.find((s) => !s.isDone)
                  : stages.find((s) => s.isDone)
                )?.id,
              })
            }
          >
            <CheckCircle2 size={16} />
            {done ? "Reopen" : "Mark Done"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setActivity(true)}
          >
            <CalendarClock size={16} />
            Activity
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => update({ archived: true })}
          >
            <Archive size={16} />
            Archive
          </button>
        </div>
      </div>
      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <main className="panel p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Stage">
              <select
                className="input"
                value={String(record.stageId)}
                onChange={(e) => update({ stageId: e.target.value })}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                className="input"
                value={String(record.priority || "medium")}
                onChange={(e) => update({ priority: e.target.value })}
              >
                <option>low</option>
                <option>medium</option>
                <option>high</option>
                <option>urgent</option>
              </select>
            </Field>
            <Field label="Due date">
              <input
                className="input"
                type="date"
                value={String(record.dueDate || "")}
                onChange={(e) => update({ dueDate: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-6">
            <p className="label">Description</p>
            <textarea
              className="input min-h-48"
              defaultValue={String(record.description || "")}
              onBlur={(e) => update({ description: e.target.value })}
            />
          </div>
        </main>
        <aside className="panel p-5">
          <h2 className="font-bold">Activity / History</h2>
          <div className="mt-4 space-y-3">
            {[...timeline]
              .sort((a, b) =>
                String(b.timestamp).localeCompare(String(a.timestamp)),
              )
              .map((h) => (
                <article key={h.id} className="rounded-xl bg-[var(--soft)] p-3">
                  <b className="capitalize">
                    {String(h.eventType ?? "updated").replaceAll("_", " ")}
                  </b>
                  <p className="mt-1 text-xs muted">
                    {h.timestamp
                      ? new Date(String(h.timestamp)).toLocaleString()
                      : ""}
                  </p>
                </article>
              ))}
          </div>
        </aside>
      </div>
      {activity && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form className="panel w-full max-w-lg p-6" onSubmit={schedule}>
            <div className="mb-5 flex justify-between">
              <h2 className="text-xl font-extrabold">Schedule Activity</h2>
              <button type="button" onClick={() => setActivity(false)}>
                <X />
              </button>
            </div>
            <Field label="Type">
              <select className="input" name="type">
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="follow-up">Follow-up</option>
                <option value="task">Task</option>
              </select>
            </Field>
            <div className="mt-4">
              <Field label="Summary">
                <input className="input" name="title" required />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Due">
                <input
                  className="input"
                  name="dueAt"
                  type="datetime-local"
                  required
                />
              </Field>
            </div>
            <button className="btn btn-primary mt-5 w-full">Schedule</button>
          </form>
        </div>
      )}
    </>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
