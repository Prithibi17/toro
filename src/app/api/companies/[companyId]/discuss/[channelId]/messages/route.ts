import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { canAccessConversation, messageMentions } from "@/lib/discuss-access";
const input = z
  .object({
    content: z.string().trim().max(5000).default(""),
    clientNonce: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{8,100}$/)
      .optional(),
    parentMessageId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,160}$/)
      .nullable()
      .default(null),
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
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; channelId: string }> },
) {
  const { companyId, channelId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  const channel = await getAdmin().db
    .doc(`companies/${companyId}/channels/${channelId}`)
    .get();
  if (
    !channel.exists ||
    !canAccessConversation(auth.access.user.uid, auth.access.membership, channel.data()!)
  )
    return NextResponse.json({ error: "Conversation not accessible" }, { status: 403 });
  const messages = await channel.ref
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const stars = messages.empty
    ? []
    : await getAdmin().db.getAll(
        ...messages.docs.map((document) =>
          document.ref.collection("stars").doc(auth.access.user.uid),
        ),
      );
  const starred = new Set(
    stars.filter((document) => document.exists).map((document) => document.ref.parent.parent?.id),
  );
  return NextResponse.json({
    messages: messages.docs
      .map((document) => ({
        id: document.id,
        ...document.data(),
        createdAt: document.data().createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: document.data().updatedAt?.toDate?.()?.toISOString() ?? null,
        starred: starred.has(document.id),
      }))
      .reverse(),
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; channelId: string }> },
) {
  const { companyId, channelId } = await params;
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
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
    const messageRef = data.clientNonce
      ? channelRef
          .collection("messages")
          .doc(`nonce_${ctx.user.uid}_${data.clientNonce}`)
      : channelRef.collection("messages").doc();
    const recipients = (channel.data()?.memberIds || []).filter(
      (id: string) => id !== ctx.user.uid,
    );
    const mentions = messageMentions(data.content).filter((uid) =>
      recipients.includes(uid),
    );
    const created = await db.runTransaction(async (tx) => {
      const existing = await tx.get(messageRef);
      if (existing.exists) return false;
      if (data.parentMessageId) {
        const parent = await tx.get(
          channelRef.collection("messages").doc(data.parentMessageId),
        );
        if (!parent.exists) throw new Error("Reply target not found");
      }
      tx.create(messageRef, {
        content: data.content,
        attachment: data.attachment,
        parentMessageId: data.parentMessageId,
        clientNonce: data.clientNonce ?? null,
        senderId: ctx.user.uid,
        senderName: ctx.user.name || ctx.user.email || "User",
        mentionIds: mentions,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        editedAt: null,
        deletedAt: null,
        reactions: {},
        pinned: false,
      });
      tx.update(channelRef, {
        lastMessage: data.content || `Attachment: ${data.attachment?.name}`,
        lastMessageId: messageRef.id,
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(recipients.length
          ? { unreadBy: FieldValue.arrayUnion(...recipients) }
          : {}),
      });
      for (const uid of recipients) {
        tx.set(
          channelRef.collection("readStates").doc(uid),
          { userId: uid, unreadCount: FieldValue.increment(1) },
          { merge: true },
        );
        const n = db.collection(`companies/${companyId}/notifications`).doc();
        tx.create(n, {
          companyId,
          recipientId: uid,
          eventType: mentions.includes(uid)
            ? "discuss.mention"
            : "discuss.message",
          title: mentions.includes(uid)
            ? `${ctx.user.name || ctx.user.email || "A member"} mentioned you`
            : channel.data()?.type === "dm"
              ? `Message from ${ctx.user.name || ctx.user.email}`
              : `New message in #${channel.data()?.name}`,
          message: data.content.slice(0, 140),
          relatedRecord: {
            type: "channel",
            id: channelId,
            messageId: messageRef.id,
          },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return true;
    });
    return NextResponse.json(
      { id: messageRef.id, duplicate: !created },
      { status: created ? 201 : 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send message" },
      { status: 400 },
    );
  }
}
