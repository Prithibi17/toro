import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { getAdmin } from "@/lib/firebase-admin";
import { getIdFinderConnection } from "@/lib/id-finder";

const input = z.object({ identifier: z.string().trim().min(3).max(100) });

async function access(companyId: string) {
  return authorizeCompany(companyId, { permission: "members.manage" });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; userId: string }> },
) {
  const { companyId, userId } = await params;
  const authz = await access(companyId);
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  try {
    const { identifier } = input.parse(await request.json());
    const db = getAdmin().db;
    const memberRef = db.doc(`companies/${companyId}/members/${userId}`);
    const member = await memberRef.get();
    if (!member.exists)
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const profile = await getIdFinderConnection(identifier);
    const connection = {
      ...profile,
      connectedAt: new Date().toISOString(),
      connectedBy: authz.access.user.uid,
    };
    const batch = db.batch();
    batch.update(memberRef, { idFinderConnection: connection });
    appendAudit(
      db,
      companyId,
      {
        actorId: authz.access.user.uid,
        action: "member.id_finder_connected",
        entityType: "member",
        entityId: userId,
        metadata: { identifier: connection.identifier },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Choose a valid ID Finder profile"
            : error instanceof Error
              ? error.message
              : "Could not connect ID Finder",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; userId: string }> },
) {
  const { companyId, userId } = await params;
  const authz = await access(companyId);
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  const db = getAdmin().db;
  const memberRef = db.doc(`companies/${companyId}/members/${userId}`);
  const member = await memberRef.get();
  if (!member.exists)
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  const batch = db.batch();
  batch.update(memberRef, { idFinderConnection: FieldValue.delete() });
  appendAudit(
    db,
    companyId,
    {
      actorId: authz.access.user.uid,
      action: "member.id_finder_disconnected",
      entityType: "member",
      entityId: userId,
    },
    batch,
  );
  await batch.commit();
  return NextResponse.json({ ok: true });
}
