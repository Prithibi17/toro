"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Archive,
  CalendarClock,
  CheckCircle2,
  Search,
  UserRound,
  X,
} from "lucide-react";
import {
  TodoDescriptionEditor,
  type TodoMention,
} from "./todo-description-editor";
type I = Record<string, unknown> & { id: string };
export function TodoRecord({
  companyId,
  task,
  stages,
  history,
  members,
  currentAssignee,
}: {
  companyId: string;
  task: I;
  stages: I[];
  history: I[];
  members: I[];
  currentAssignee?: I;
}) {
  const router = useRouter(),
    [record, setRecord] = useState(task),
    [timeline, setTimeline] = useState(history),
    [activity, setActivity] = useState(false),
    [assigneeOpen, setAssigneeOpen] = useState(false),
    [memberSearch, setMemberSearch] = useState(""),
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
      ...(body.assignedToUserId
        ? { assigneeIds: [body.assignedToUserId] }
        : {}),
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
      const eventType = body.assignedToUserId
        ? "assignee_changed"
        : body.priority
          ? "priority_changed"
          : body.dueDate !== undefined
            ? "due_date_changed"
            : body.archived
              ? "archived"
              : body.stageId
                ? "stage_changed"
                : "description_changed";
      const nextMember = body.assignedToUserId
        ? members.find((member) => member.id === body.assignedToUserId)
        : undefined;
      setTimeline((currentHistory) => [
        {
          id: `local-${Date.now()}`,
          eventType,
          fromLabel: body.assignedToUserId
            ? assigneeName(record, currentAssignee, members)
            : undefined,
          toLabel: nextMember ? memberName(nextMember) : undefined,
          from: body.priority
            ? record.priority
            : body.dueDate !== undefined
              ? record.dueDate
              : undefined,
          to: body.priority
            ? body.priority
            : body.dueDate !== undefined
              ? body.dueDate
              : undefined,
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
          <p className="mt-1 text-sm muted">
            Created by {String(record.creatorName ?? "a workspace member")}
          </p>
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
            <div className="relative">
              <span className="label">Assignee</span>
              <button
                type="button"
                className="input flex w-full items-center gap-2 text-left"
                onClick={() => setAssigneeOpen((open) => !open)}
              >
                <Avatar name={assigneeName(record, currentAssignee, members)} />
                <span className="truncate">
                  {assigneeName(record, currentAssignee, members)}
                </span>
              </button>
              {assigneeOpen && (
                <div className="absolute z-30 mt-2 w-full min-w-72 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-xl">
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border)] px-3">
                    <Search size={15} />
                    <input
                      className="w-full bg-transparent py-2 outline-none"
                      autoFocus
                      placeholder="Search members…"
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {members
                      .filter((member) =>
                        memberName(member)
                          .toLowerCase()
                          .includes(memberSearch.toLowerCase()),
                      )
                      .map((member) => (
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-[var(--soft)]"
                          key={member.id}
                          onClick={() => {
                            setAssigneeOpen(false);
                            setMemberSearch("");
                            void update({ assignedToUserId: member.id });
                          }}
                        >
                          <Avatar name={memberName(member)} />
                          <span>
                            <b className="block text-sm">
                              {memberName(member)}
                            </b>
                            {Boolean(
                              member.jobTitle ?? member.departmentName,
                            ) && (
                              <small className="muted">
                                {String(
                                  member.jobTitle ?? member.departmentName,
                                )}
                              </small>
                            )}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-6">
            <p className="label">Description</p>
            <TodoDescriptionEditor
              companyId={companyId}
              value={String(record.description || "")}
              mentions={
                (record.descriptionMentions as TodoMention[] | undefined) ?? []
              }
              onCommit={(description, descriptionMentions) =>
                update({ description, descriptionMentions })
              }
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
                  <b>{historyTitle(h)}</b>
                  {Boolean(h.fromLabel ?? h.from ?? h.toLabel ?? h.to) && (
                    <p className="mt-1 text-sm">
                      {String(h.fromLabel ?? h.from ?? "—")} →{" "}
                      {String(h.toLabel ?? h.to ?? "—")}
                    </p>
                  )}
                  {Boolean(h.actorName) && (
                    <p className="mt-1 text-xs muted">
                      by {String(h.actorName)}
                    </p>
                  )}
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
function memberName(member?: I) {
  return String(
    member?.displayName ??
      member?.name ??
      member?.email ??
      "Former member / unavailable assignee",
  );
}
function assigneeName(task: I, current: I | undefined, members: I[]) {
  const id = String((task.assigneeIds as string[] | undefined)?.[0] ?? "");
  return memberName(
    members.find((member) => member.id === id) ??
      (current?.id === id ? current : undefined),
  );
}
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--soft)] text-xs font-bold">
      {initials || <UserRound size={14} />}
    </span>
  );
}
function historyTitle(history: I) {
  const labels: Record<string, string> = {
    created: "Task created",
    stage_changed: "Stage changed",
    priority_changed: "Priority changed",
    due_date_changed: "Due date changed",
    assignee_changed: "Assignee changed",
    description_changed: "Description changed",
    activity_scheduled: "Activity scheduled",
    archived: "Task archived",
  };
  return labels[String(history.eventType)] ?? "Task updated";
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
