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
import { ensureTodoStages } from "@/lib/todo-stages";
const input = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().max(30).default(""),
  stageId: z.string().min(1).max(128),
});
const serial = (d: FirebaseFirestore.QueryDocumentSnapshot) => ({
  id: d.id,
  ...d.data(),
  createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
  completedAt: d.data().completedAt?.toDate?.()?.toISOString() ?? null,
});
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    a = await authorizeCompany(companyId, { module: "todo" });
  if (!a.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(a.reason) },
    );
  const db = getAdmin().db;
  await ensureTodoStages(db, companyId, a.access.user.uid);
  const [taskSnap, stageSnap] = await Promise.all([
    db
      .collection(`companies/${companyId}/tasks`)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get(),
    db
      .collection(`companies/${companyId}/todoStages`)
      .where("userId", "==", a.access.user.uid)
      .get(),
  ]);
  const stages = stageSnap.docs
    .map(
      (d) =>
        ({ id: d.id, ...d.data() }) as {
          id: string;
          sequence?: number;
          legacyStatus?: string;
        },
    )
    .sort((x, y) => Number(x.sequence) - Number(y.sequence));
  return NextResponse.json({
    tasks: taskSnap.docs
      .filter(
        (d) =>
          !d.data().archivedAt &&
          canReadTask(a.access.user.uid, a.access.membership, d.data()),
      )
      .map((d) => {
        const data = serial(d),
          legacy = stages.find((s) => s.legacyStatus === d.data().status);
        return {
          ...data,
          stageId: d.data().stageId || legacy?.id || stages[0]?.id,
        };
      }),
    stages,
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    a = await authorizeCompany(companyId, { module: "todo" });
  if (!a.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(a.reason) },
    );
  try {
    const data = input.parse(await req.json()),
      db = getAdmin().db,
      stage = await db
        .doc(`companies/${companyId}/todoStages/${data.stageId}`)
        .get();
    if (!stage.exists || stage.data()?.userId !== a.access.user.uid)
      return NextResponse.json(
        { error: "Invalid personal stage" },
        { status: 400 },
      );
    const ref = db.collection(`companies/${companyId}/tasks`).doc(),
      batch = db.batch(),
      record = {
        ...data,
        status: stage.data()?.legacyStatus || "todo",
        companyId,
        ownerId: a.access.user.uid,
        creatorId: a.access.user.uid,
        creatorName: a.access.user.name ?? a.access.user.email ?? "User",
        assigneeIds: [a.access.user.uid],
        viewerIds: [],
        departmentIds: a.access.membership.departmentIds ?? [],
        sequence: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        updatedBy: a.access.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
    batch.create(ref, record);
    batch.create(db.collection(`companies/${companyId}/todoHistory`).doc(), {
      todoId: ref.id,
      actorId: a.access.user.uid,
      eventType: "created",
      timestamp: FieldValue.serverTimestamp(),
    });
    appendAudit(
      db,
      companyId,
      {
        actorId: a.access.user.uid,
        action: "todo.created",
        entityType: "todo",
        entityId: ref.id,
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json(
      {
        task: {
          id: ref.id,
          ...data,
          completedAt: null,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError ? "Enter a title" : "Could not create To-Do",
      },
      { status: 400 },
    );
  }
}
