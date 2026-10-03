import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { canAccessConversation } from "@/lib/discuss-access";
const input = z
  .object({
    content: z.string().trim().max(5000).default(""),
    attachment: z
      .object({
        name: z.string(),
        url: z.string().url(),
        type: z.string(),
        size: z.number(),
      })
      .nullable()
      .default(null),
  })
  .refine((x) => x.content || x.attachment, "Message is empty");
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; channelId: string }> },
) {
  const { companyId, channelId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const ctx = auth.access;
  try {
    const db = getAdmin().db;
    const channelRef = db.doc(`companies/${companyId}/channels/${channelId}`);
    const channel = await channelRef.get();
    if (
      !channel.exists ||
      !canAccessConversation(ctx.user.uid, ctx.membership, channel.data()!)
    )
      return NextResponse.json(
        { error: "Conversation not accessible" },
        { status: 403 },
      );
    const data = input.parse(await req.json());
    const messageRef = channelRef.collection("messages").doc();
    const recipients = (channel.data()?.memberIds || []).filter(
      (id: string) => id !== ctx.user.uid,
    );
    const batch = db.batch();
    batch.create(messageRef, {
      ...data,
      senderId: ctx.user.uid,
      senderName: ctx.user.name || ctx.user.email || "User",
      createdAt: FieldValue.serverTimestamp(),
      edited: false,
      reactions: {},
    });
    batch.update(channelRef, {
      lastMessage: data.content || `Attachment: ${data.attachment?.name}`,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      unreadBy: FieldValue.arrayUnion(...recipients),
    });
    for (const uid of recipients) {
      const n = db.collection(`companies/${companyId}/notifications`).doc();
      batch.create(n, {
        companyId,
        recipientId: uid,
        eventType: "discuss.message",
        title:
          channel.data()?.type === "dm"
            ? `Message from ${ctx.user.name || ctx.user.email}`
            : `New message in #${channel.data()?.name}`,
        message: data.content.slice(0, 140),
        relatedRecord: { type: "channel", id: channelId },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    return NextResponse.json({ id: messageRef.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send message" },
      { status: 400 },
    );
  }
}
