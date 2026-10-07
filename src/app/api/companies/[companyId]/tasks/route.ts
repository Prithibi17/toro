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
import { canAssignTodoTo } from "@/lib/todo-assignment";
const input = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().max(30).default(""),
  stageId: z.string().min(1).max(128),
  assignedToUserId: z.string().min(1).max(128).optional(),
});
const serial = (d: FirebaseFirestore.QueryDocumentSnapshot) => ({
  id: d.id,
  ...d.data(),
  createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
  completedAt: d.data().completedAt?.toDate?.()?.toISOString() ?? null,
});
export async function GET(
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
  const db = getAdmin().db,
    view = new URL(req.url).searchParams.get("view") ?? "assigned";
  await ensureTodoStages(db, companyId, a.access.user.uid);
  const [taskSnap, stageSnap, memberSnap] = await Promise.all([
    db
      .collection(`companies/${companyId}/tasks`)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get(),
    db
      .collection(`companies/${companyId}/todoStages`)
      .where("userId", "==", a.access.user.uid)
      .get(),
    db.collection(`companies/${companyId}/members`).limit(500).get(),
  ]);
  const memberById = new Map(
    memberSnap.docs.map((member) => [member.id, member.data()]),
  );
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
          canReadTask(a.access.user.uid, a.access.membership, d.data()) &&
          (view === "all"
            ? true
            : view === "created"
            ? d.data().creatorId === a.access.user.uid
            : view === "assigned-by-me"
              ? d.data().creatorId === a.access.user.uid &&
                !d.data().assigneeIds?.includes(a.access.user.uid)
              : d.data().assigneeIds?.includes(a.access.user.uid)),
      )
      .map((d) => {
        const data = serial(d),
          legacy = stages.find((s) => s.legacyStatus === d.data().status);
        return {
          ...data,
          stageId: stages.some((stage) => stage.id === d.data().stageId)
            ? d.data().stageId
            : legacy?.id || stages[0]?.id,
          assignee: (() => {
            const id = String(d.data().assigneeIds?.[0] ?? ""),
              member = memberById.get(id);
            return id
              ? {
                  id,
                  displayName:
                    member?.displayName ?? member?.email ?? "Former member",
                  status: member?.status ?? "unavailable",
                }
              : null;
          })(),
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
      assigneeId = data.assignedToUserId ?? a.access.user.uid,
      [stage, assignee] = await Promise.all([
        db.doc(`companies/${companyId}/todoStages/${data.stageId}`).get(),
        db.doc(`companies/${companyId}/members/${assigneeId}`).get(),
      ]);
    if (!stage.exists || stage.data()?.userId !== a.access.user.uid)
      return NextResponse.json(
        { error: "Invalid personal stage" },
        { status: 400 },
      );
    if (
      !assignee.exists ||
      !canAssignTodoTo(a.access.user.uid, a.access.membership, {
        id: assignee.id,
        ...assignee.data(),
      })
    )
      return NextResponse.json(
        { error: "You cannot assign this To-Do to that member" },
        { status: 403 },
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
        assigneeIds: [assigneeId],
        viewerIds: [],
        departmentIds: a.access.membership.departmentIds ?? [],
        sequence: Date.now(),
        createdAt: FieldValue.serverTimestamp(),
        updatedBy: a.access.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
    delete (record as { assignedToUserId?: unknown }).assignedToUserId;
    batch.create(ref, record);
    batch.create(db.collection(`companies/${companyId}/todoHistory`).doc(), {
      todoId: ref.id,
      actorId: a.access.user.uid,
      eventType: "created",
      actorName: a.access.user.name ?? a.access.user.email ?? "User",
      assigneeId,
      assigneeName:
        assignee.data()?.displayName ?? assignee.data()?.email ?? "Member",
      timestamp: FieldValue.serverTimestamp(),
    });
    if (assigneeId !== a.access.user.uid)
      batch.create(
        db.collection(`companies/${companyId}/notifications`).doc(),
        {
          companyId,
          recipientId: assigneeId,
          title: `${a.access.user.name ?? a.access.user.email ?? "A workspace member"} assigned you a To-Do`,
          message: String(data.title),
          read: false,
          eventType: "todo.assignment",
          relatedRecord: { type: "todo", id: ref.id },
          href: `/workspace/${companyId}/todo/${ref.id}`,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
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
          assigneeIds: [assigneeId],
          assignee: {
            id: assigneeId,
            displayName:
              assignee.data()?.displayName ??
              assignee.data()?.email ??
              "Member",
            status: "active",
          },
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
