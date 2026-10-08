import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { getAdmin } from "@/lib/firebase-admin";

const workDays = z.array(z.number().int().min(0).max(6)).min(1).max(7);
const createInput = z.object({
  name: z.string().trim().min(2).max(80),
  workDays: workDays.default([1, 2, 3, 4, 5, 6]),
});
const updateInput = createInput.partial().extend({ departmentId: z.string().min(1) });
const deleteInput = z.object({ departmentId: z.string().min(1) });

async function departmentAdmin(companyId: string) {
  const auth = await authorizeCompany(companyId);
  if (!auth.ok) return auth;
  return ["owner", "admin"].includes(auth.access.membership.role)
    ? auth
    : ({ ok: false, reason: "permission_denied" } as const);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await departmentAdmin(companyId);
  if (!auth.ok)
    return NextResponse.json(
      { error: "Only the owner or an administrator can create departments" },
      { status: authorizationStatus(auth.reason) },
    );
  const parsed = createInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid department" }, { status: 400 });
  const db = getAdmin().db;
  const ref = db.collection(`companies/${companyId}/departments`).doc();
  const batch = db.batch();
  batch.create(ref, {
    ...parsed.data,
    memberIds: [],
    createdBy: auth.access.user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  appendAudit(
    db,
    companyId,
    {
      actorId: auth.access.user.uid,
      action: "department.created",
      entityType: "department",
      entityId: ref.id,
    },
    batch,
  );
  await batch.commit();
  return NextResponse.json({ department: { id: ref.id, ...parsed.data } }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await departmentAdmin(companyId);
  if (!auth.ok)
    return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid department" }, { status: 400 });
  const { departmentId, ...changes } = parsed.data;
  const ref = getAdmin().db.doc(`companies/${companyId}/departments/${departmentId}`);
  if (!(await ref.get()).exists)
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  await ref.update({ ...changes, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await departmentAdmin(companyId);
  if (!auth.ok)
    return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const parsed = deleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid department" }, { status: 400 });
  const db = getAdmin().db;
  const ref = db.doc(`companies/${companyId}/departments/${parsed.data.departmentId}`);
  if (!(await ref.get()).exists)
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  const members = await db.collection(`companies/${companyId}/members`).get();
  const batch = db.batch();
  members.docs.forEach((member) => {
    if (!member.data().departmentIds?.includes(parsed.data.departmentId)) return;
    batch.update(member.ref, {
      departmentIds: FieldValue.arrayRemove(parsed.data.departmentId),
      permissionVersion: FieldValue.increment(1),
    });
    batch.set(
      db.doc(`users/${member.id}/companyMemberships/${companyId}`),
      { departmentIds: FieldValue.arrayRemove(parsed.data.departmentId) },
      { merge: true },
    );
  });
  batch.delete(ref);
  appendAudit(
    db,
    companyId,
    {
      actorId: auth.access.user.uid,
      action: "department.deleted",
      entityType: "department",
      entityId: parsed.data.departmentId,
    },
    batch,
  );
  await batch.commit();
  return NextResponse.json({ ok: true });
}
