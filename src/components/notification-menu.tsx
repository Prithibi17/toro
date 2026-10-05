"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, ClipboardCheck } from "lucide-react";

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

export function NotificationMenu({
  companyId,
  category,
}: {
  companyId: string;
  category: Category;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/companies/${companyId}/notifications`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((result) => setNotes(result.notifications || []))
      .catch(() => {});
    return () => controller.abort();
  }, [companyId]);

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

  function markRead(id: string) {
    setNotes((current) =>
      current.map((note) => (note.id === id ? { ...note, read: true } : note)),
    );
    void fetch(`/api/companies/${companyId}/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: id }),
    });
  }

  return (
    <div className="relative">
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
              return href ? (
                <Link
                  className="block border-b border-[var(--border)] p-4 last:border-0 hover:bg-[var(--soft)]"
                  key={note.id}
                  href={href}
                  onClick={() => markRead(note.id)}
                >
                  {content}
                </Link>
              ) : (
                <button
                  className="block w-full border-b border-[var(--border)] p-4 text-left last:border-0 hover:bg-[var(--soft)]"
                  key={note.id}
                  type="button"
                  onClick={() => markRead(note.id)}
                >
                  {content}
                </button>
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
