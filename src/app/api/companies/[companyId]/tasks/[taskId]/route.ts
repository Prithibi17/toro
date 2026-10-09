import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdmin } from "@/lib/firebase-admin";
import {
  authorizeCompany,
  authorizationStatus,
  canReadTask,
} from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { canAssignTodoTo } from "@/lib/todo-assignment";
import { crmAllowed } from "@/lib/crm-server";
import { can } from "@/lib/can";
import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { normalizeCompletionSummary } from "@/lib/todo-completion";
const mention = z.object({
  entityType: z.enum(["member", "contact", "company", "tag"]),
  entityId: z.string().min(1).max(128),
  label: z.string().trim().min(1).max(160),
});
const input = z.object({
  stageId: z.string().max(128).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  descriptionMentions: z.array(mention).max(50).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().max(30).optional(),
  archived: z.boolean().optional(),
  assignedToUserId: z.string().min(1).max(128).optional(),
  completionSummary: z.string().trim().min(1).max(2000).optional(),
});
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string; taskId: string }> },
) {
  const { companyId, taskId } = await params,
    a = await authorizeCompany(companyId, { module: "todo" });
  if (!a.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(a.reason) },
    );
  try {
    const data = input.parse(await req.json()),
      db = getAdmin().db,
      ref = db.doc(`companies/${companyId}/tasks/${taskId}`),
      doc = await ref.get();
    if (data.completionSummary !== undefined)
      data.completionSummary = normalizeCompletionSummary(data.completionSummary);
    if (!doc.exists)
      return NextResponse.json({ error: "To-Do not found" }, { status: 404 });
    const isAdministrator = ["owner", "admin"].includes(
        a.access.membership.role,
      ),
      isManager = a.access.membership.role === "manager";
    if (
      !canReadTask(a.access.user.uid, a.access.membership, doc.data()!) ||
      (!isAdministrator &&
        !isManager &&
        !doc.data()?.assigneeIds?.includes(a.access.user.uid) &&
        doc.data()?.creatorId !== a.access.user.uid)
    )
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    let stage: null | FirebaseFirestore.DocumentSnapshot = null;
    if (data.stageId) {
      stage = await db
        .doc(`companies/${companyId}/todoStages/${data.stageId}`)
        .get();
      if (!stage.exists || stage.data()?.userId !== a.access.user.uid)
        return NextResponse.json(
          { error: "Invalid personal stage" },
          { status: 400 },
        );
    }
    const update: Record<string, unknown> = {
      ...data,
      updatedBy: a.access.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    delete update.assignedToUserId;
    delete update.archived;
    let newAssignee: FirebaseFirestore.DocumentSnapshot | null = null;
    const previousAssigneeId = String(doc.data()?.assigneeIds?.[0] ?? "");
    if (data.assignedToUserId && data.assignedToUserId !== previousAssigneeId) {
      newAssignee = await db
        .doc(`companies/${companyId}/members/${data.assignedToUserId}`)
        .get();
      if (
        !newAssignee.exists ||
        !canAssignTodoTo(a.access.user.uid, a.access.membership, {
          id: newAssignee.id,
          ...newAssignee.data(),
        })
      )
        return NextResponse.json(
          { error: "You cannot assign this To-Do to that member" },
          { status: 403 },
        );
      update.assigneeIds = [newAssignee.id];
      update.assignedById = a.access.user.uid;
      update.assignedByName =
        a.access.user.name ?? a.access.user.email ?? "User";
    }
    if (stage) {
      update.status = stage.data()?.legacyStatus || "todo";
      if (stage.data()?.isDone) {
        update.completedAt = FieldValue.serverTimestamp();
        if (data.completionSummary) {
          update.completionSummary = data.completionSummary;
          update.completedById = a.access.user.uid;
          update.completedByName =
            a.access.user.name ?? a.access.user.email ?? "User";
        }
      } else {
        update.completedAt = null;
        update.completionSummary = null;
        update.completedById = null;
        update.completedByName = null;
      }
    }
    if (data.completionSummary && !stage?.data()?.isDone)
      return NextResponse.json(
        { error: "A completion summary can only be added when marking the To-Do done" },
        { status: 400 },
      );
    if (data.archived !== undefined)
      update.archivedAt = data.archived ? FieldValue.serverTimestamp() : null;
    if (data.descriptionMentions) {
      const unique = new Set<string>();
      const historical = new Set(
        (
          (doc.data()?.descriptionMentions ?? []) as Array<{
            entityType?: string;
            entityId?: string;
          }>
        ).map(
          (reference) =>
            `${reference.entityType ?? ""}:${reference.entityId ?? ""}`,
        ),
      );
      for (const reference of data.descriptionMentions) {
        const key = `${reference.entityType}:${reference.entityId}`;
        if (unique.has(key))
          return NextResponse.json(
            { error: "Duplicate description reference" },
            { status: 400 },
          );
        unique.add(key);
        if (historical.has(key)) continue;
        const collection =
          reference.entityType === "member"
            ? "members"
            : reference.entityType === "tag"
              ? "crmTags"
              : "contacts";
        const linked = await db
          .doc(`companies/${companyId}/${collection}/${reference.entityId}`)
          .get();
        const linkedData = linked.data();
        const valid =
          linked.exists &&
          (reference.entityType !== "member" ||
            linkedData?.status === "active") &&
          (reference.entityType !== "tag" || linkedData?.active !== false) &&
          ((reference.entityType !== "contact" &&
            reference.entityType !== "company") ||
            (linkedData?.archived !== true &&
              crmAllowed(a.access, "contacts", "view", linkedData)));
        if (!valid)
          return NextResponse.json(
            { error: "Invalid or restricted description reference" },
            { status: 403 },
          );
      }
    }
    const batch = db.batch();
    batch.update(ref, update);
    const actorName = a.access.user.name ?? a.access.user.email ?? "User";
    const addHistory = (
      eventType: string,
      from: unknown,
      to: unknown,
      fromLabel?: string,
      toLabel?: string,
      details?: Record<string, unknown>,
    ) =>
      batch.create(db.collection(`companies/${companyId}/todoHistory`).doc(), {
        todoId: taskId,
        actorId: a.access.user.uid,
        actorName,
        eventType,
        from: from ?? null,
        to: to ?? null,
        fromLabel: fromLabel ?? null,
        toLabel: toLabel ?? null,
        ...(details ?? {}),
        timestamp: FieldValue.serverTimestamp(),
      });
    if (data.stageId && data.stageId !== doc.data()?.stageId) {
      const oldStageId = doc.data()?.stageId,
        oldStage = oldStageId
          ? await db
              .doc(`companies/${companyId}/todoStages/${oldStageId}`)
              .get()
          : null;
      addHistory(
        data.completionSummary ? "completed" : "stage_changed",
        oldStageId,
        data.stageId,
        String(oldStage?.data()?.name ?? "Unknown stage"),
        String(stage?.data()?.name ?? "Unknown stage"),
        data.completionSummary
          ? { completionSummary: data.completionSummary }
          : undefined,
      );
    }
    if (data.priority && data.priority !== doc.data()?.priority)
      addHistory("priority_changed", doc.data()?.priority, data.priority);
    if (data.dueDate !== undefined && data.dueDate !== doc.data()?.dueDate)
      addHistory("due_date_changed", doc.data()?.dueDate, data.dueDate);
    if (
      data.description !== undefined &&
      data.description !== doc.data()?.description
    )
      addHistory("description_changed", null, null);
    if (data.descriptionMentions) {
      const previousMentionIds = new Set(
        (
          (doc.data()?.descriptionMentions ?? []) as Array<{
            entityType?: string;
            entityId?: string;
          }>
        )
          .filter((reference) => reference.entityType === "member")
          .map((reference) => reference.entityId),
      );
      for (const reference of data.descriptionMentions) {
        if (
          reference.entityType !== "member" ||
          reference.entityId === a.access.user.uid ||
          previousMentionIds.has(reference.entityId)
        )
          continue;
        batch.create(
          db.collection(`companies/${companyId}/notifications`).doc(),
          {
            companyId,
            recipientId: reference.entityId,
            title: `${actorName} mentioned you in a To-Do`,
            message: String(doc.data()?.title ?? "To-Do"),
            read: false,
            eventType: "todo.mention",
            relatedRecord: { type: "todo", id: taskId },
            href: `/workspace/${companyId}/todo/${taskId}`,
            createdAt: FieldValue.serverTimestamp(),
          },
        );
      }
    }
    if (data.archived) addHistory("archived", false, true);
    if (newAssignee) {
      const oldAssignee = previousAssigneeId
        ? await db
            .doc(`companies/${companyId}/members/${previousAssigneeId}`)
            .get()
        : null;
      const oldName = String(
          oldAssignee?.data()?.displayName ??
            oldAssignee?.data()?.email ??
            "Former member",
        ),
        newName = String(
          newAssignee.data()?.displayName ??
            newAssignee.data()?.email ??
            "Member",
        );
      addHistory(
        "assignee_changed",
        previousAssigneeId,
        newAssignee.id,
        oldName,
        newName,
      );
      if (newAssignee.id !== a.access.user.uid)
        batch.create(
          db.collection(`companies/${companyId}/notifications`).doc(),
          {
            companyId,
            recipientId: newAssignee.id,
            title: `${actorName} assigned you a To-Do`,
            message: String(doc.data()?.title ?? "To-Do"),
            read: false,
            eventType: "todo.assignment",
            relatedRecord: { type: "todo", id: taskId },
            href: `/workspace/${companyId}/todo/${taskId}`,
            createdAt: FieldValue.serverTimestamp(),
          },
        );
    }
    appendAudit(
      db,
      companyId,
      {
        actorId: a.access.user.uid,
        action: data.stageId ? "todo.stage_changed" : "todo.updated",
        entityType: "todo",
        entityId: taskId,
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({
      ok: true,
      completion: data.completionSummary
        ? {
            summary: data.completionSummary,
            actorId: a.access.user.uid,
            actorName: a.access.user.name ?? a.access.user.email ?? "User",
            timestamp: new Date().toISOString(),
          }
        : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError ? "Invalid update" : "Could not update To-Do",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ companyId: string; taskId: string }> },
) {
  const { companyId, taskId } = await params;
  const auth = await authorizeCompany(companyId, { module: "todo" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  if (!can(auth.access, "todo.delete", "todo"))
    return NextResponse.json(
      { error: "Only the Owner or a member with delete authority can delete To-Dos" },
      { status: 403 },
    );
  try {
    const db = getAdmin().db;
    const ref = db.doc(`companies/${companyId}/tasks/${taskId}`);
    const task = await ref.get();
    if (!task.exists)
      return NextResponse.json({ error: "To-Do not found" }, { status: 404 });
    const [history, activities, attachmentChunks] = await Promise.all([
      db
        .collection(`companies/${companyId}/todoHistory`)
        .where("todoId", "==", taskId)
        .limit(300)
        .get(),
      db
        .collection(`companies/${companyId}/crmActivities`)
        .where("relatedId", "==", taskId)
        .limit(150)
        .get(),
      ref.collection("attachmentChunks").get(),
    ]);
    const batch = db.batch();
    history.docs.forEach((document) => batch.delete(document.ref));
    activities.docs
      .filter((document) => document.data().relatedType === "task")
      .forEach((document) => batch.delete(document.ref));
    attachmentChunks.docs.forEach((document) => batch.delete(document.ref));
    batch.delete(ref);
    appendAudit(
      db,
      companyId,
      {
        actorId: auth.access.user.uid,
        action: "todo.deleted",
        entityType: "todo",
        entityId: taskId,
      },
      batch,
    );
    await batch.commit();
    const attachmentPath = (task.data()?.attachment as { path?: string } | undefined)?.path;
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (attachmentPath && bucketName && getApps().length)
      await getStorage(getApps()[0])
        .bucket(bucketName)
        .file(attachmentPath)
        .delete({ ignoreNotFound: true })
        .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete To-Do" },
      { status: 500 },
    );
  }
}
