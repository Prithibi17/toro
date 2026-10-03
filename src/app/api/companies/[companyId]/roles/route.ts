import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { resolveRoleGraph } from "@/lib/permission-engine";
import type { RoleDefinition } from "@/lib/types";
import { roleInput } from "@/lib/role-validation";

async function securityAccess(companyId: string) {
  return authorizeCompany(companyId, { permission: "security.manage" });
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const authz = await securityAccess(companyId);
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  const snapshot = await getAdmin()
    .db.collection(`companies/${companyId}/roles`)
    .orderBy("name")
    .get();
  return NextResponse.json({
    roles: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const authz = await securityAccess(companyId);
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  try {
    const data = roleInput.parse(await req.json());
    const db = getAdmin().db;
    const existing = await db.collection(`companies/${companyId}/roles`).get();
    const ref = db.collection(`companies/${companyId}/roles`).doc();
    const candidate = {
      id: ref.id,
      ...data,
      active: true,
      system: false,
    } satisfies RoleDefinition;
    const roles = existing.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as RoleDefinition,
    );
    resolveRoleGraph([ref.id], [...roles, candidate]);
    const batch = db.batch();
    batch.create(ref, {
      ...data,
      active: true,
      system: false,
      createdBy: authz.access.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    appendAudit(
      db,
      companyId,
      {
        actorId: authz.access.user.uid,
        action: "security.role.created",
        entityType: "role",
        entityId: ref.id,
        metadata: { name: data.name },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid role configuration"
            : error instanceof Error
              ? error.message
              : "Could not create role",
      },
      { status: 400 },
    );
  }
}
