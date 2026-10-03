"use client";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Phone, Video } from "lucide-react";
import { clientDb } from "@/lib/firebase-client";
import { CallRoom } from "./discuss-call";
type Call = {
  id: string;
  callType: "audio" | "video";
  creatorName: string;
  participantCount: number;
  status: string;
  createdAt?: string;
};
export function ActiveMeetingCard({
  companyId,
  conversationId,
  title,
}: {
  companyId: string;
  conversationId: string;
  title: string;
}) {
  const [call, setCall] = useState<Call | null>(null);
  const [join, setJoin] = useState(false);
  useEffect(() => {
    if (!clientDb) return;
    return onSnapshot(
      doc(clientDb, "companies", companyId, "channels", conversationId),
      async (snap) => {
        const id = snap.data()?.activeCallId;
        if (!id) {
          setCall(null);
          return;
        }
        const r = await fetch(`/api/companies/${companyId}/calls/${id}`);
        if (r.ok) setCall((await r.json()).call);
      },
      () => setCall(null),
    );
  }, [companyId, conversationId]);
  if (!call || !["creating", "ringing", "active"].includes(call.status))
    return null;
  return (
    <>
      <div className="mx-auto mb-6 max-w-2xl rounded-2xl border border-orange-500/30 bg-orange-500/8 p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)] text-white">
            {call.callType === "video" ? <Video /> : <Phone />}
          </span>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
              Live {call.callType} meeting
            </p>
            <h3 className="mt-1 font-bold">
              {call.creatorName} started a meeting
            </h3>
            <p className="mt-1 text-sm muted">
              {call.participantCount || 0} participant(s) currently connected ·{" "}
              {call.status}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setJoin(true)}>
            Join meeting
          </button>
        </div>
      </div>
      {join && (
        <CallRoom
          companyId={companyId}
          callId={call.id}
          mode={call.callType}
          title={title}
          onClose={() => setJoin(false)}
        />
      )}
    </>
  );
}
