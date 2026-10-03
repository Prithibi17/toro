import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { canAccessConversation } from "@/lib/discuss-access";
import { getAdmin } from "@/lib/firebase-admin";
import { ensureTodoStages } from "@/lib/todo-stages";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("react"), reaction: z.string().min(1).max(16) }),
  z.object({ action: z.literal("star"), starred: z.boolean() }),
  z.object({ action: z.literal("pin"), pinned: z.boolean() }),
  z.object({
    action: z.literal("edit"),
    content: z.string().trim().min(1).max(5000),
  }),
  z.object({ action: z.literal("delete") }),
  z.object({
    action: z.literal("createTodo"),
    title: z.string().trim().min(1).max(180).optional(),
  }),
]);

async function context(
  companyId: string,
  channelId: string,
  messageId: string,
) {
  const auth = await authorizeCompany(companyId, { module: "discuss" });
  if (!auth.ok) return { error: authorizationStatus(auth.reason) } as const;
  const db = getAdmin().db;
  const channelRef = db.doc(`companies/${companyId}/channels/${channelId}`);
  const messageRef = channelRef.collection("messages").doc(messageId);
  const [channel, message] = await Promise.all([
    channelRef.get(),
    messageRef.get(),
  ]);
  if (
    !channel.exists ||
    !message.exists ||
    !canAccessConversation(
      auth.access.user.uid,
      auth.access.membership,
      channel.data()!,
    )
  )
    return { error: 404 } as const;
  return { auth, db, channel, channelRef, message, messageRef } as const;
}

export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      companyId: string;
      channelId: string;
      messageId: string;
    }>;
  },
) {
  const { companyId, channelId, messageId } = await params;
  const ctx = await context(companyId, channelId, messageId);
  if ("error" in ctx)
    return NextResponse.json(
      { error: "Not found or access denied" },
      { status: ctx.error },
    );
  try {
    const data = input.parse(await req.json());
    const uid = ctx.auth.access.user.uid;
    if (data.action === "star") {
      const ref = ctx.messageRef.collection("stars").doc(uid);
      if (data.starred)
        await ref.set({ userId: uid, createdAt: FieldValue.serverTimestamp() });
      else await ref.delete();
      return NextResponse.json({ ok: true });
    }
    if (data.action === "react") {
      await ctx.db.runTransaction(async (tx) => {
        const fresh = await tx.get(ctx.messageRef);
        if (!fresh.exists) throw new Error("Message not found");
        const reactions = { ...(fresh.data()?.reactions ?? {}) } as Record<
          string,
          string[]
        >;
        const current = new Set(reactions[data.reaction] ?? []);
        if (current.has(uid)) current.delete(uid);
        else current.add(uid);
        reactions[data.reaction] = [...current];
        tx.update(ctx.messageRef, {
          reactions,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ ok: true });
    }
    if (data.action === "pin") {
      const canPin =
        ctx.channel.data()?.createdBy === uid ||
        ctx.auth.access.membership.role === "owner" ||
        ctx.auth.access.membership.actionPermissions?.[
          "discuss.message.pin"
        ] === true;
      if (!canPin)
        return NextResponse.json(
          { error: "Pin permission required" },
          { status: 403 },
        );
      await ctx.messageRef.update({
        pinned: data.pinned,
        pinnedBy: data.pinned ? uid : FieldValue.delete(),
        pinnedAt: data.pinned
          ? FieldValue.serverTimestamp()
          : FieldValue.delete(),
      });
      return NextResponse.json({ ok: true });
    }
    if (data.action === "edit") {
      if (ctx.message.data()?.senderId !== uid)
        return NextResponse.json(
          { error: "Only the author can edit this message" },
          { status: 403 },
        );
      await ctx.messageRef.update({
        content: data.content,
        editedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }
    if (data.action === "delete") {
      if (
        ctx.message.data()?.senderId !== uid &&
        ctx.auth.access.membership.actionPermissions?.[
          "discuss.message.moderate"
        ] !== true
      )
        return NextResponse.json(
          { error: "Delete permission required" },
          { status: 403 },
        );
      await ctx.messageRef.update({
        content: "",
        attachment: null,
        deletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }
    await ensureTodoStages(ctx.db, companyId, uid);
    const stageSnapshot = await ctx.db
      .collection(`companies/${companyId}/todoStages`)
      .where("userId", "==", uid)
      .get();
    const stage = stageSnapshot.docs
      .map(
        (document) =>
          ({ id: document.id, ...document.data() }) as {
            id: string;
            sequence?: number;
            legacyStatus?: string;
          },
      )
      .sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))[0];
    if (!stage) throw new Error("To-Do stage unavailable");
    const taskRef = ctx.db.collection(`companies/${companyId}/tasks`).doc();
    const title =
      data.title ||
      String(
        ctx.message.data()?.content || "Follow up on Discuss message",
      ).slice(0, 180);
    const batch = ctx.db.batch();
    batch.create(taskRef, {
      companyId,
      title,
      description: "Created from a Discuss message.",
      stageId: stage.id,
      status: stage.legacyStatus || "todo",
      priority: "normal",
      privacy: "private",
      creatorId: uid,
      assigneeIds: [uid],
      viewerIds: [],
      source: { type: "discuss.message", channelId, messageId },
      archived: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    appendAudit(
      ctx.db,
      companyId,
      {
        actorId: uid,
        action: "discuss.message.todo_created",
        entityType: "task",
        entityId: taskRef.id,
        metadata: { channelId, messageId },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ ok: true, taskId: taskRef.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid action"
            : error instanceof Error
              ? error.message
              : "Action failed",
      },
      { status: 400 },
    );
  }
}
