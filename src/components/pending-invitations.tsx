"use client";
import { useEffect, useState, useTransition } from "react";
import { Building2, Check, X } from "lucide-react";
import { memberRoleLabel } from "@/lib/member-role";

interface PendingInvitation {
  id: string;
  companyId: string;
  companyName: string;
  role: string;
  invitedBy: string;
  expiresAt: string | null;
}

export function PendingInvitations() {
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isPending, startTransition] = useTransition();
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/invitations")
      .then((r) => r.json())
      .then((j) => setInvitations(j.invitations ?? []))
      .catch(() => {});
  }, []);

  if (invitations.length === 0) return null;

  async function respond(inv: PendingInvitation, action: "accept" | "decline") {
    setActing(inv.id);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/invitations/${inv.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, companyId: inv.companyId }),
        });
        if (res.ok) {
          setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
          if (action === "accept") {
            // Refresh the page so the new company card appears
            window.location.reload();
          }
        }
      } finally {
        setActing(null);
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl mb-8">
      <p className="mb-3 text-sm font-bold uppercase tracking-[.2em] text-[var(--accent)]">
        Pending invitations
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="panel flex items-start justify-between gap-4 p-5 border-[var(--accent)]/30"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--soft)]">
                <Building2 size={18} />
              </span>
              <div>
                <p className="font-semibold leading-tight">{inv.companyName}</p>
                <p className="mt-0.5 text-xs muted capitalize">
                  Role: {memberRoleLabel(inv.role)} · Invited by {inv.invitedBy}
                </p>
                {inv.expiresAt && (
                  <p className="mt-0.5 text-xs text-amber-500">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                title="Decline"
                disabled={acting === inv.id || isPending}
                onClick={() => respond(inv, "decline")}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition"
              >
                <X size={15} />
              </button>
              <button
                title="Accept"
                disabled={acting === inv.id || isPending}
                onClick={() => respond(inv, "accept")}
                className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 transition"
              >
                <Check size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
