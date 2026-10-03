import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdmin } from "@/lib/firebase-admin";
import { authorizeCompany, authorizationStatus, canReadTask } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";

const taskInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().max(30).default(""),
  status: z.enum(["todo", "in-progress", "review", "done"]).default("todo")
});

export async function GET(_: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId,{module:"todo"});
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const snap = await getAdmin().db.collection(`companies/${companyId}/tasks`).orderBy("createdAt", "desc").limit(200).get();
  return NextResponse.json({ tasks: snap.docs.filter(d=>canReadTask(auth.access.user.uid,auth.access.membership,d.data())).map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null })) });
}

export async function POST(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId,{module:"todo",permission:"tasks.create"});
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  try {
    const input = taskInput.parse(await req.json());
    const ref = getAdmin().db.collection(`companies/${companyId}/tasks`).doc();
    const record = { ...input, companyId, ownerId: auth.access.user.uid, creatorId: auth.access.user.uid, creatorName: auth.access.user.name ?? auth.access.user.email ?? "User", assigneeIds: [auth.access.user.uid], viewerIds: [], departmentIds: auth.access.membership.departmentIds??[], createdAt: FieldValue.serverTimestamp(), updatedBy: auth.access.user.uid, updatedAt: FieldValue.serverTimestamp() };
    const db=getAdmin().db;const batch=db.batch();batch.create(ref,record);appendAudit(db,companyId,{actorId:auth.access.user.uid,action:"task.created",entityType:"task",entityId:ref.id},batch);await batch.commit();
    return NextResponse.json({ task: { id: ref.id, ...input, creatorName: record.creatorName } }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid task" }, { status: 400 }); }
}
