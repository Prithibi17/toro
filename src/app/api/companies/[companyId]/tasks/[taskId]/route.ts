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
    }
    if (stage) {
      update.status = stage.data()?.legacyStatus || "todo";
      if (stage.data()?.isDone)
        update.completedAt = FieldValue.serverTimestamp();
      else update.completedAt = null;
    }
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
        "stage_changed",
        oldStageId,
        data.stageId,
        String(oldStage?.data()?.name ?? "Unknown stage"),
        String(stage?.data()?.name ?? "Unknown stage"),
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
    return NextResponse.json({ ok: true });
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
