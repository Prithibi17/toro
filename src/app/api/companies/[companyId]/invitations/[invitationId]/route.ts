import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { getAdmin } from "@/lib/firebase-admin";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ companyId: string; invitationId: string }> },
) {
  const { companyId, invitationId } = await params,
    auth = await authorizeCompany(companyId, { permission: "members.manage" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  const db = getAdmin().db,
    ref = db.doc(`companies/${companyId}/invitations/${invitationId}`),
    invite = await ref.get();
  if (!invite.exists)
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 },
    );
  if (invite.data()?.status !== "pending")
    return NextResponse.json(
      { error: "Only pending invitations can be cancelled" },
      { status: 409 },
    );
  const batch = db.batch();
  batch.update(ref, {
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    cancelledBy: auth.access.user.uid,
  });
  appendAudit(
    db,
    companyId,
    {
      actorId: auth.access.user.uid,
      action: "member.invitation_cancelled",
      entityType: "invitation",
      entityId: invitationId,
    },
    batch,
  );
  await batch.commit();
  return NextResponse.json({ ok: true });
}
