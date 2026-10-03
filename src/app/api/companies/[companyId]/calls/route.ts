import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { canAccessConversation } from "@/lib/discuss-access";
const input = z.object({
  conversationId: z.string().min(1),
  callType: z.enum(["audio", "video"]),
});
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const ctx = auth.access;
  try {
    const data = input.parse(await req.json());
    const db = getAdmin().db;
    const channelRef = db.doc(
      `companies/${companyId}/channels/${data.conversationId}`,
    );
    const callRef = db.collection(`companies/${companyId}/calls`).doc();
    const result = await db.runTransaction(async (tx) => {
      const channel = await tx.get(channelRef);
      if (
        !channel.exists ||
        !canAccessConversation(ctx.user.uid, ctx.membership, channel.data()!)
      )
        throw new Error("Conversation not accessible");
      const activeId = channel.data()?.activeCallId as string | undefined;
      if (activeId) {
        const active = await tx.get(
          db.doc(`companies/${companyId}/calls/${activeId}`),
        );
        if (
          active.exists &&
          ["creating", "ringing", "active"].includes(active.data()?.status)
        )
          return { id: active.id, ...active.data() };
      }
      const isDirect = channel.data()?.type === "dm";
      const record = {
        companyId,
        conversationId: data.conversationId,
        conversationType: channel.data()?.type || "channel",
        callType: data.callType,
        createdBy: ctx.user.uid,
        creatorName: ctx.user.name || ctx.user.email || "User",
        createdAt: FieldValue.serverTimestamp(),
        startedAt: null,
        endedAt: null,
        status: isDirect ? "ringing" : "creating",
        participantCount: 0,
        memberIds: channel.data()?.memberIds || [],
        provider: "webrtc",
        providerRoomId: `toro_${companyId}_${callRef.id}`,
      };
      tx.create(callRef, record);
      tx.update(channelRef, {
        activeCallId: callRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const uid of (channel.data()?.memberIds || []).filter(
        (x: string) => x !== ctx.user.uid,
      )) {
        const note = db
          .collection(`companies/${companyId}/notifications`)
          .doc();
        tx.create(note, {
          companyId,
          recipientId: uid,
          eventType: isDirect ? "call.incoming" : "call.started",
          title: `${data.callType === "video" ? "Video" : "Audio"} ${isDirect ? "call" : "meeting"}`,
          message: `${ctx.user.name || ctx.user.email || "A member"} started a ${data.callType} call.`,
          relatedRecord: {
            type: "call",
            id: callRef.id,
            conversationId: data.conversationId,
          },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return { id: callRef.id, ...record };
    });
    return NextResponse.json({ call: result }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start call" },
      { status: 400 },
    );
  }
}
