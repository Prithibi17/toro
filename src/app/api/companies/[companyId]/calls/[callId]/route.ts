import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { canAccessConversation } from "@/lib/discuss-access";
const action = z.object({
  action: z.enum(["join", "leave", "decline", "end"]),
  sessionId: z.string().max(100).default(""),
});
async function authorized(companyId: string, callId: string) {
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok) return null;
  const ctx = auth.access;
  const db = getAdmin().db;
  const call = await db.doc(`companies/${companyId}/calls/${callId}`).get();
  if (!call.exists) return null;
  const channel = await db
    .doc(`companies/${companyId}/channels/${call.data()?.conversationId}`)
    .get();
  if (
    !channel.exists ||
    !canAccessConversation(ctx.user.uid, ctx.membership, channel.data()!)
  )
    return null;
  return { ctx, call, db };
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; callId: string }> },
) {
  const { companyId, callId } = await params;
  const a = await authorized(companyId, callId);
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const participants = await a.call.ref.collection("participants").get();
  const x = a.call.data()!;
  return NextResponse.json({
    call: {
      id: a.call.id,
      ...x,
      createdAt: x.createdAt?.toDate?.()?.toISOString() || null,
      startedAt: x.startedAt?.toDate?.()?.toISOString() || null,
      endedAt: x.endedAt?.toDate?.()?.toISOString() || null,
    },
    participants: participants.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      joinedAt: d.data().joinedAt?.toDate?.()?.toISOString() || null,
    })),
  });
}
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string; callId: string }> },
) {
  const { companyId, callId } = await params;
  const a = await authorized(companyId, callId);
  if (!a) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = action.parse(await req.json());
    const { ctx, db } = a;
    const callRef = db.doc(`companies/${companyId}/calls/${callId}`);
    const participantRef = callRef.collection("participants").doc(ctx.user.uid);
    await db.runTransaction(async (tx) => {
      const [call, participant] = await Promise.all([
        tx.get(callRef),
        tx.get(participantRef),
      ]);
      if (!call.exists) throw new Error("Call not found");
      const c = call.data()!;
      if (data.action === "join") {
        if (["ended", "declined", "missed", "failed"].includes(c.status))
          throw new Error("This call has ended");
        const already =
          participant.exists &&
          participant.data()?.connectionStatus === "connected";
        tx.set(
          participantRef,
          {
            userId: ctx.user.uid,
            name: ctx.user.name || ctx.user.email || "User",
            sessionId: data.sessionId,
            connectionStatus: "connected",
            joinedAt:
              participant.data()?.joinedAt || FieldValue.serverTimestamp(),
            lastSeenAt: FieldValue.serverTimestamp(),
            microphone: true,
            camera: c.callType === "video",
          },
          { merge: true },
        );
        tx.update(callRef, {
          status: "active",
          startedAt: c.startedAt || FieldValue.serverTimestamp(),
          participantCount: already
            ? c.participantCount || 1
            : FieldValue.increment(1),
        });
      } else if (data.action === "leave") {
        const connected =
          participant.exists &&
          participant.data()?.connectionStatus === "connected";
        tx.set(
          participantRef,
          {
            connectionStatus: "disconnected",
            leftAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        const next = Math.max(
          0,
          (c.participantCount || 0) - (connected ? 1 : 0),
        );
        tx.update(callRef, {
          participantCount: next,
          ...(next === 0
            ? { status: "ended", endedAt: FieldValue.serverTimestamp() }
            : {}),
        });
        if (next === 0)
          tx.update(
            db.doc(`companies/${companyId}/channels/${c.conversationId}`),
            { activeCallId: FieldValue.delete() },
          );
      } else if (data.action === "decline") {
        tx.update(callRef, {
          status: "declined",
          endedAt: FieldValue.serverTimestamp(),
        });
        tx.update(
          db.doc(`companies/${companyId}/channels/${c.conversationId}`),
          { activeCallId: FieldValue.delete() },
        );
      } else {
        if (c.createdBy !== ctx.user.uid && ctx.membership.role !== "owner")
          throw new Error("Only the host can end this meeting");
        tx.update(callRef, {
          status: "ended",
          endedAt: FieldValue.serverTimestamp(),
          participantCount: 0,
        });
        tx.update(
          db.doc(`companies/${companyId}/channels/${c.conversationId}`),
          { activeCallId: FieldValue.delete() },
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Call update failed" },
      { status: 400 },
    );
  }
}
