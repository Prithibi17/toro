import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdmin } from "@/lib/firebase-admin";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";

const updateInput = z.object({ status: z.enum(["todo", "in-progress", "review", "done"]) });
export async function PATCH(req: Request, { params }: { params: Promise<{ companyId: string; taskId: string }> }) {
  const { companyId, taskId } = await params;
  const auth = await authorizeCompany(companyId,{module:"todo",permission:"tasks.move"});
  if (!auth.ok) return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  try {
    const input = updateInput.parse(await req.json());
    const ref = getAdmin().db.doc(`companies/${companyId}/tasks/${taskId}`);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const db=getAdmin().db;const batch=db.batch();batch.update(ref,{ status: input.status, updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.access.user.uid });appendAudit(db,companyId,{actorId:auth.access.user.uid,action:"task.status_changed",entityType:"task",entityId:taskId,metadata:{status:input.status}},batch);await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid update" }, { status: 400 }); }
}
