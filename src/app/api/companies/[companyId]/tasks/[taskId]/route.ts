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
const input = z.object({
  stageId: z.string().max(128).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().max(30).optional(),
  archived: z.boolean().optional(),
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
    if (
      !canReadTask(a.access.user.uid, a.access.membership, doc.data()!) ||
      (!doc.data()?.assigneeIds?.includes(a.access.user.uid) &&
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
    delete update.archived;
    if (stage) {
      update.status = stage.data()?.legacyStatus || "todo";
      if (stage.data()?.isDone)
        update.completedAt = FieldValue.serverTimestamp();
      else update.completedAt = null;
    }
    if (data.archived !== undefined)
      update.archivedAt = data.archived ? FieldValue.serverTimestamp() : null;
    const batch = db.batch();
    batch.update(ref, update);
    batch.create(db.collection(`companies/${companyId}/todoHistory`).doc(), {
      todoId: taskId,
      actorId: a.access.user.uid,
      eventType: data.archived
        ? "archived"
        : data.stageId
          ? "stage_changed"
          : "updated",
      fromStageId: doc.data()?.stageId ?? null,
      toStageId: data.stageId ?? null,
      timestamp: FieldValue.serverTimestamp(),
    });
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
