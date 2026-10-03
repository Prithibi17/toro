import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { resolveRoleGraph } from "@/lib/permission-engine";
import type { RoleDefinition } from "@/lib/types";
import { roleInput } from "@/lib/role-validation";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string; roleId: string }> },
) {
  const { companyId, roleId } = await params;
  const authz = await authorizeCompany(companyId, {
    permission: "security.manage",
  });
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  try {
    const data = roleInput.parse(await req.json());
    if (data.inheritedRoleIds.includes(roleId))
      throw new Error("A role cannot inherit itself");
    const db = getAdmin().db;
    const ref = db.doc(`companies/${companyId}/roles/${roleId}`);
    const [current, all] = await Promise.all([
      ref.get(),
      db.collection(`companies/${companyId}/roles`).get(),
    ]);
    if (!current.exists)
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    const roles = all.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as RoleDefinition)
      .filter((role) => role.id !== roleId);
    resolveRoleGraph(
      [roleId],
      [...roles, { id: roleId, ...current.data(), ...data } as RoleDefinition],
    );
    const batch = db.batch();
    batch.update(ref, {
      ...data,
      updatedBy: authz.access.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    appendAudit(
      db,
      companyId,
      {
        actorId: authz.access.user.uid,
        action: "security.role.updated",
        entityType: "role",
        entityId: roleId,
        metadata: { name: data.name },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid role configuration"
            : error instanceof Error
              ? error.message
              : "Could not update role",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ companyId: string; roleId: string }> },
) {
  const { companyId, roleId } = await params;
  const authz = await authorizeCompany(companyId, {
    permission: "security.manage",
  });
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  const db = getAdmin().db;
  const ref = db.doc(`companies/${companyId}/roles/${roleId}`);
  const [role, assigned] = await Promise.all([
    ref.get(),
    db
      .collection(`companies/${companyId}/members`)
      .where("roleIds", "array-contains", roleId)
      .limit(1)
      .get(),
  ]);
  if (!role.exists)
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.data()?.system)
    return NextResponse.json(
      { error: "System roles cannot be deleted" },
      { status: 409 },
    );
  if (!assigned.empty)
    return NextResponse.json(
      { error: "Remove this role from all members first" },
      { status: 409 },
    );
  const batch = db.batch();
  batch.delete(ref);
  appendAudit(
    db,
    companyId,
    {
      actorId: authz.access.user.uid,
      action: "security.role.deleted",
      entityType: "role",
      entityId: roleId,
    },
    batch,
  );
  await batch.commit();
  return NextResponse.json({ ok: true });
}
