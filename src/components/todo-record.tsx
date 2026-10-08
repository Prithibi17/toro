"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Paperclip,
  Search,
  UserRound,
  Trash2,
  X,
} from "lucide-react";
import {
  TodoDescriptionEditor,
  type TodoMention,
} from "./todo-description-editor";
import { ConfirmDialog } from "./confirm-dialog";
import { useOutsideDismiss } from "@/lib/use-outside-dismiss";
type I = Record<string, unknown> & { id: string };
export function TodoRecord({
  companyId,
  task,
  stages,
  history,
  members,
  currentAssignee,
  canDelete,
  canPostProgress,
}: {
  companyId: string;
  task: I;
  stages: I[];
  history: I[];
  members: I[];
  currentAssignee?: I;
  canDelete: boolean;
  canPostProgress: boolean;
}) {
  const router = useRouter(),
    [record, setRecord] = useState(task),
    [timeline, setTimeline] = useState(history),
    [activity, setActivity] = useState(false),
    [archiveConfirm, setArchiveConfirm] = useState(false),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [removeFileConfirm, setRemoveFileConfirm] = useState(false),
    [completionOpen, setCompletionOpen] = useState(false),
    [completionSummary, setCompletionSummary] = useState(""),
    [completing, setCompleting] = useState(false),
    [uploading, setUploading] = useState(false),
    [progressText, setProgressText] = useState(""),
    [postingProgress, setPostingProgress] = useState(false),
    [deleting, setDeleting] = useState(false),
    [assigneeOpen, setAssigneeOpen] = useState(false),
    [memberSearch, setMemberSearch] = useState(""),
    [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const assigneeMenu = useRef<HTMLDivElement>(null);
  const closeAssignee = useCallback(() => {
    setAssigneeOpen(false);
    setMemberSearch("");
  }, []);
  useOutsideDismiss(assigneeMenu, assigneeOpen, closeAssignee);
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
    try {
      const r = await fetch(`/api/companies/${companyId}/tasks/${record.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setRecord(previous);
        setError((await r.json()).error ?? "Could not update To-Do");
        return false;
      }
      const result = await r.json();
      if (result.completion) {
        setRecord((currentRecord) => ({
          ...currentRecord,
          completionSummary: result.completion.summary,
          completedById: result.completion.actorId,
          completedByName: result.completion.actorName,
          completedAt: result.completion.timestamp,
        }));
      }
      const eventType = body.assignedToUserId
        ? "assignee_changed"
        : body.priority
          ? "priority_changed"
          : body.dueDate !== undefined
            ? "due_date_changed"
            : body.archived
              ? "archived"
              : body.stageId
                ? body.completionSummary
                  ? "completed"
                  : "stage_changed"
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
          completionSummary: body.completionSummary,
          actorName: result.completion?.actorName,
        },
        ...currentHistory,
      ]);
      if (body.archived) router.push(`/workspace/${companyId}/todo`);
      window.dispatchEvent(new Event("toro:notifications-changed"));
      return true;
    } catch {
      setRecord(previous);
      setError("Could not update To-Do. Check your connection and try again.");
      return false;
    }
  }
  async function completeTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const summary = completionSummary.trim();
    if (!summary) return;
    const doneStage = stages.find((stage) => stage.isDone);
    if (!doneStage) {
      setError("A completed stage is not configured");
      return;
    }
    setCompleting(true);
    const saved = await update({ stageId: doneStage.id, completionSummary: summary });
    setCompleting(false);
    if (saved) {
      setCompletionOpen(false);
      setCompletionSummary("");
    }
  }
  async function uploadFile(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/companies/${companyId}/tasks/${record.id}/file`, {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (response.ok) {
        setRecord((currentRecord) => ({ ...currentRecord, attachment: body.attachment }));
        setTimeline((currentHistory) => [{
          id: `file-${Date.now()}`,
          eventType: "file_attached",
          fileName: body.attachment.name,
          actorName: body.attachment.createdByName,
          timestamp: body.attachment.createdAt,
        }, ...currentHistory]);
      } else setError(body.error ?? "Could not attach file");
    } catch {
      setError("Could not attach file. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function removeFile() {
    setUploading(true);
    const fileName = String((record.attachment as I | undefined)?.name ?? "Attachment");
    try {
      const response = await fetch(`/api/companies/${companyId}/tasks/${record.id}/file`, { method: "DELETE" });
      if (response.ok) {
        setRecord((currentRecord) => {
          const next = { ...currentRecord };
          delete next.attachment;
          return next;
        });
        setTimeline((currentHistory) => [{
          id: `file-${Date.now()}`,
          eventType: "file_removed",
          fileName,
          timestamp: new Date().toISOString(),
        }, ...currentHistory]);
      } else setError((await response.json()).error ?? "Could not remove file");
    } catch {
      setError("Could not remove file. Check your connection and try again.");
    } finally {
      setUploading(false);
      setRemoveFileConfirm(false);
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
  async function postProgress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = progressText.trim();
    if (!content) return;
    setPostingProgress(true);
    setError("");
    try {
      const response = await fetch(
        `/api/companies/${companyId}/tasks/${record.id}/updates`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save progress update");
      setTimeline((currentHistory) => [body.update, ...currentHistory]);
      setProgressText("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save progress update",
      );
    } finally {
      setPostingProgress(false);
    }
  }
  async function deleteTask() {
    setDeleting(true);
    setError("");
    const response = await fetch(
      `/api/companies/${companyId}/tasks/${record.id}`,
      { method: "DELETE" },
    );
    if (response.ok) {
      router.push(`/workspace/${companyId}/todo`);
      router.refresh();
      return;
    }
    setError((await response.json()).error ?? "Could not delete To-Do");
    setDeleting(false);
    setDeleteConfirm(false);
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
            To-Do
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
            onClick={() => {
              if (done)
                void update({ stageId: stages.find((stage) => !stage.isDone)?.id });
              else setCompletionOpen(true);
            }}
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
            onClick={() => setArchiveConfirm(true)}
          >
            <Archive size={16} />
            Move to Archive
          </button>
          {canDelete && (
            <button
              className="btn bg-red-600 text-white hover:bg-red-700"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 size={16} />
              Delete
            </button>
          )}
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
                onChange={(e) => {
                  const nextStage = stages.find((stage) => stage.id === e.target.value);
                  if (!done && nextStage?.isDone) setCompletionOpen(true);
                  else void update({ stageId: e.target.value });
                }}
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
            <div ref={assigneeMenu} className="relative">
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
              onCommit={async (description, descriptionMentions) => {
                await update({ description, descriptionMentions });
              }}
            />
          </div>
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <p className="label">Attachment</p>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.docx,.xlsx"
              onChange={(event) => void uploadFile(event.target.files?.[0])}
            />
            {record.attachment ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--soft)] p-4">
                <FileText size={20} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{String((record.attachment as I).name)}</b>
                  <small className="muted">One attachment maximum</small>
                </div>
                <a className="btn btn-secondary" href={`/api/companies/${companyId}/tasks/${record.id}/file`}>
                  <Download size={16} /> Download
                </a>
                <button className="btn btn-secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
                <button className="btn btn-secondary" disabled={uploading} onClick={() => setRemoveFileConfirm(true)}>
                  Remove
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
                <Paperclip size={16} /> {uploading ? "Uploading…" : "Attach file"}
              </button>
            )}
            <p className="mt-2 text-xs muted">PDF, text, CSV, JPG, PNG, Word, or Excel. Maximum 4 MB.</p>
          </div>
          {done && Boolean(record.completionSummary) && (
            <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--soft)] p-4">
              <p className="label">Completion summary</p>
              <p className="whitespace-pre-wrap">{String(record.completionSummary)}</p>
              <p className="mt-2 text-xs muted">
                Completed by {String(record.completedByName ?? "a workspace member")}
                {record.completedAt ? ` · ${new Date(String(record.completedAt)).toLocaleString()}` : ""}
              </p>
            </section>
          )}
        </main>
        <aside className="panel p-5">
          <section>
            <h2 className="font-bold">Progress Updates</h2>
            <p className="mt-1 text-sm muted">
              Periodic notes about work completed or currently in progress.
            </p>
            {canPostProgress && (
              <form className="mt-4" onSubmit={postProgress}>
                <textarea
                  className="input min-h-24 resize-y"
                  required
                  maxLength={2000}
                  value={progressText}
                  onChange={(event) => setProgressText(event.target.value)}
                  placeholder="Share a progress update…"
                />
                <button
                  className="btn btn-primary mt-2 w-full"
                  disabled={postingProgress || !progressText.trim()}
                >
                  {postingProgress ? "Posting…" : "Post Update"}
                </button>
              </form>
            )}
            {!canPostProgress && (
              <p className="mt-3 rounded-xl bg-[var(--soft)] p-3 text-sm muted">
                Only an employee currently assigned to this To-Do can post updates.
              </p>
            )}
            <div className="mt-4 space-y-3">
              {[...timeline]
                .filter((item) => item.eventType === "progress_update")
                .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
                .map((item) => (
                  <article key={item.id} className="rounded-xl bg-[var(--soft)] p-3">
                    <p className="whitespace-pre-wrap text-sm">{String(item.content)}</p>
                    <p className="mt-2 text-xs muted">
                      {String(item.actorName ?? "Workspace member")}
                      {item.timestamp ? ` · ${new Date(String(item.timestamp)).toLocaleString()}` : ""}
                    </p>
                  </article>
                ))}
              {!timeline.some((item) => item.eventType === "progress_update") && (
                <p className="text-sm muted">No progress updates yet.</p>
              )}
            </div>
          </section>
          <section className="mt-6 border-t border-[var(--border)] pt-5">
          <h2 className="font-bold">Activity / History</h2>
          <div className="mt-4 space-y-3">
            {[...timeline]
              .filter((item) => item.eventType !== "progress_update")
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
                  {Boolean(h.completionSummary) && (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{String(h.completionSummary)}</p>
                  )}
                  {Boolean(h.fileName) && (
                    <p className="mt-1 text-sm">{String(h.fileName)}</p>
                  )}
                  <p className="mt-1 text-xs muted">
                    {h.timestamp
                      ? new Date(String(h.timestamp)).toLocaleString()
                      : ""}
                  </p>
                </article>
              ))}
          </div>
          </section>
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
      {completionOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !completing) setCompletionOpen(false);
        }}>
          <form className="panel w-full max-w-lg p-6" onSubmit={completeTask}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold">Mark this To-Do as done?</h2>
                <p className="mt-1 text-sm muted">Briefly summarize the work you completed. This will appear in Activity / History.</p>
              </div>
              <button type="button" disabled={completing} onClick={() => setCompletionOpen(false)}><X /></button>
            </div>
            <Field label="Completion summary">
              <textarea
                className="input min-h-32 resize-y"
                autoFocus
                required
                maxLength={2000}
                value={completionSummary}
                onChange={(event) => setCompletionSummary(event.target.value)}
                placeholder="What was completed?"
              />
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" disabled={completing} onClick={() => setCompletionOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={completing || !completionSummary.trim()}>
                <CheckCircle2 size={16} /> {completing ? "Saving…" : "Mark as Done"}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={removeFileConfirm}
        title="Remove this attachment?"
        description="The attached file will be permanently removed from this To-Do."
        confirmLabel="Remove Attachment"
        destructive
        busy={uploading}
        onCancel={() => setRemoveFileConfirm(false)}
        onConfirm={() => void removeFile()}
      />
      <ConfirmDialog
        open={archiveConfirm}
        title="Move this To-Do to the archive?"
        description="This does not delete the To-Do. It will be hidden from your active list, while its details and activity history remain safely stored."
        confirmLabel="Move to Archive"
        onCancel={() => setArchiveConfirm(false)}
        onConfirm={() => {
          setArchiveConfirm(false);
          void update({ archived: true });
        }}
      />
      <ConfirmDialog
        open={deleteConfirm}
        title="Permanently delete this To-Do?"
        description="This permanently deletes the To-Do, its activity history, and linked scheduled activities. This action cannot be undone."
        confirmLabel="Delete Permanently"
        destructive
        busy={deleting}
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={() => void deleteTask()}
      />
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
    completed: "Task completed",
    file_attached: "File attached",
    file_removed: "File removed",
    progress_update: "Progress update",
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
