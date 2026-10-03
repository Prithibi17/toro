"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
type Note = {
  id: string;
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: string;
  relatedRecord?: { type?: string; id?: string; messageId?: string };
};
export function NotificationMenu({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => {
    fetch(`/api/companies/${companyId}/notifications`)
      .then((r) => r.json())
      .then((j) => setNotes(j.notifications || []))
      .catch(() => {});
  }, [companyId]);
  const unread = notes.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button
        className="btn btn-secondary relative !p-2.5"
        aria-label="Notifications"
        onClick={() => setOpen(!open)}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="panel absolute right-0 top-12 z-50 w-80 overflow-hidden shadow-2xl">
          <div className="border-b border-[var(--border)] p-4">
            <b>Notifications</b>
            <p className="text-xs muted">
              Only events relevant to your account
            </p>
          </div>
          <div className="max-h-80 overflow-auto">
            {notes.map((n) => {
              const channel =
                n.relatedRecord?.type === "channel" && n.relatedRecord.id;
              const content = (
                <>
                  <p className="text-sm font-bold">
                    {n.title || "Notification"}
                  </p>
                  <p className="mt-1 text-xs leading-5 muted">{n.message}</p>
                </>
              );
              return channel ? (
                <Link
                  className="block border-b border-[var(--border)] p-4 last:border-0 hover:bg-[var(--soft)]"
                  key={n.id}
                  href={`/workspace/${companyId}/discuss?channel=${channel}${n.relatedRecord?.messageId ? `&message=${n.relatedRecord.messageId}` : ""}`}
                >
                  {content}
                </Link>
              ) : (
                <div
                  className="border-b border-[var(--border)] p-4 last:border-0"
                  key={n.id}
                >
                  {content}
                </div>
              );
            })}
            {!notes.length && (
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
