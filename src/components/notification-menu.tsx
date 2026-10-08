"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarClock, ClipboardCheck, TriangleAlert, X } from "lucide-react";
import { useOutsideDismiss } from "@/lib/use-outside-dismiss";
import {
  deadlinePresentation,
  type TodoDeadlineStatus,
} from "@/lib/todo-deadline";

type Category = "general" | "work";
type Note = {
  id: string;
  title?: string;
  message?: string;
  read?: boolean;
  eventType?: string;
  href?: string;
  createdAt?: string | null;
  relatedRecord?: { type?: string; id?: string; messageId?: string };
  dueDate?: string;
  deadlineStatus?: TodoDeadlineStatus | null;
  requiresCompletion?: boolean;
  taskStatus?: string;
  tracking?: boolean;
  completed?: boolean;
};

const isWork = (note: Note) =>
  ["todo.", "crm.", "sales."].some((prefix) =>
    note.eventType?.startsWith(prefix),
  );

function getHref(note: Note, companyId: string) {
  const root = `/workspace/${companyId}/`;
  if (note.href?.startsWith(root)) return note.href;
  const record = note.relatedRecord;
  if (record?.type === "opportunity" && record.id)
    return `${root}crm/opportunities/${record.id}`;
  if ((record?.type === "todo" || record?.type === "task") && record.id)
    return `${root}todo/${record.id}`;
  if (record?.type === "channel" && record.id)
    return `${root}discuss?channel=${record.id}${record.messageId ? `&message=${record.messageId}` : ""}`;
  return null;
}

export function NotificationCenter({ companyId }: { companyId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const load = useCallback(() => {
    const controller = new AbortController();
    fetch(`/api/companies/${companyId}/notifications`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((result) => setNotes(result.notifications || []))
      .catch(() => {});
    return controller;
  }, [companyId]);

  useEffect(() => {
    let controller = load();
    const refresh = () => {
      controller.abort();
      controller = load();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("toro:notifications-changed", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("toro:notifications-changed", refresh);
    };
  }, [load]);

  function markRead(note: Note) {
    if (note.requiresCompletion || note.read) return;
    setNotes((current) =>
      current.map((item) =>
        item.id === note.id ? { ...item, read: true } : item,
      ),
    );
    void fetch(`/api/companies/${companyId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: note.id, action: "markRead" }),
    });
  }

  async function dismissNotification(note: Note) {
    if (note.requiresCompletion) return;
    setNotes((current) => current.filter((item) => item.id !== note.id));
    const response = await fetch(`/api/companies/${companyId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: note.id, action: "dismiss" }),
    });
    if (!response.ok) load();
  }

  return (
    <>
      <NotificationMenu
        companyId={companyId}
        category="general"
        notes={notes}
        markRead={markRead}
        dismissNotification={dismissNotification}
      />
      <NotificationMenu
        companyId={companyId}
        category="work"
        notes={notes}
        markRead={markRead}
        dismissNotification={dismissNotification}
      />
    </>
  );
}

function NotificationMenu({
  companyId,
  category,
  notes,
  markRead,
  dismissNotification,
}: {
  companyId: string;
  category: Category;
  notes: Note[];
  markRead: (note: Note) => void;
  dismissNotification: (note: Note) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  useOutsideDismiss(container, open, dismiss);
  const visible = useMemo(
    () =>
      notes.filter((note) =>
        category === "work" ? isWork(note) : !isWork(note),
      ),
    [category, notes],
  );
  const unread = visible.filter((note) => !note.read).length;
  const workMenu = category === "work";
  const Icon = workMenu ? ClipboardCheck : Bell;
  const label = workMenu ? "Work notifications" : "General notifications";

  return (
    <div ref={container} className="relative">
      <button
        className="btn btn-secondary relative !p-2.5"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="panel absolute right-0 top-12 z-50 w-80 overflow-hidden shadow-2xl">
          <div className="border-b border-[var(--border)] p-4">
            <b>{label}</b>
            <p className="text-xs muted">
              {workMenu
                ? "To-Do, CRM, and Sales activity"
                : "Workspace, messages, calls, and account activity"}
            </p>
          </div>
          <div className="max-h-80 overflow-auto">
            {visible.map((note) => {
              const href = getHref(note, companyId);
              const deadline = note.deadlineStatus
                ? deadlinePresentation[note.deadlineStatus]
                : null;
              const content = (
                <>
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-bold">
                      {note.title || "Notification"}
                    </p>
                    {!note.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 muted">{note.message}</p>
                  {note.requiresCompletion && (
                    <div
                      className={`mt-2 rounded-lg bg-[var(--soft)] p-2 text-xs ${deadline?.textClass ?? "text-amber-500"}`}
                    >
                      <p className="flex items-center gap-1 font-semibold">
                        <TriangleAlert size={13} />
                        This warning remains until the To-Do is completed.
                      </p>
                      <p className="mt-1 flex items-center gap-1">
                        <CalendarClock size={13} />
                        {deadline && (
                          <span
                            className={`h-2 w-2 rounded-full ${deadline.dotClass}`}
                          />
                        )}
                        {deadline?.label ?? "Deadline not set"}
                        {note.dueDate ? ` · ${note.dueDate}` : ""}
                      </p>
                    </div>
                  )}
                  {note.tracking && (
                    <div
                      className={`mt-2 rounded-lg bg-[var(--soft)] p-2 text-xs ${note.completed ? "text-emerald-600" : deadline?.textClass ?? "muted"}`}
                    >
                      <p className="font-semibold">
                        Status · {note.taskStatus ?? "Not completed"}
                      </p>
                      <p className="mt-1 flex items-center gap-1">
                        <CalendarClock size={13} />
                        {deadline && (
                          <span
                            className={`h-2 w-2 rounded-full ${deadline.dotClass}`}
                          />
                        )}
                        {note.completed
                          ? "Work completed"
                          : deadline?.label ?? "Deadline not set"}
                        {note.dueDate ? ` · ${note.dueDate}` : ""}
                      </p>
                    </div>
                  )}
                  {note.createdAt && (
                    <p className="mt-2 text-[11px] muted">
                      {new Date(note.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </>
              );
              return (
                <div
                  className="relative border-b border-[var(--border)] last:border-0"
                  key={note.id}
                >
                  {href ? (
                    <Link
                      className={`block p-4 hover:bg-[var(--soft)] ${!note.requiresCompletion ? "pr-11" : ""}`}
                      href={href}
                      onClick={() => {
                        markRead(note);
                        setOpen(false);
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      className={`block w-full p-4 text-left hover:bg-[var(--soft)] ${!note.requiresCompletion ? "pr-11" : ""}`}
                      type="button"
                      onClick={() => markRead(note)}
                    >
                      {content}
                    </button>
                  )}
                  {!note.requiresCompletion && (
                    <button
                      type="button"
                      aria-label={`Dismiss ${note.title || "notification"}`}
                      title="Remove this notification"
                      className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--text)]"
                      onClick={() => void dismissNotification(note)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
            {!visible.length && (
              <p className="p-8 text-center text-sm muted">
                You’re all caught up.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
