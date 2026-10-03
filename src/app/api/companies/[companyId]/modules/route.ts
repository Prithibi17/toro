import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { MODULES } from "@/lib/types";
import { appendAudit } from "@/lib/audit";
const input = z.object({ modules: z.array(z.string()) });
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId, { permission: "apps.manage" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  try {
    const { modules } = input.parse(await req.json());
    const allowed = new Set(MODULES.map((m) => m.key));
    if (modules.some((m) => !allowed.has(m as never)))
      throw new Error("Unknown app");
    const db = getAdmin().db;
    const members = await db.collection(`companies/${companyId}/members`).get();
    if (members.size > 249)
      return NextResponse.json(
        { error: "Company is too large for this operation" },
        { status: 400 },
      );
    const batch = db.batch();
    batch.update(db.doc(`companies/${companyId}`), {
      enabledModules: modules,
      updatedAt: FieldValue.serverTimestamp(),
    });
    members.docs.forEach((m) => {
      batch.update(m.ref, { enabledModules: modules });
      batch.set(
        db.doc(`users/${m.id}/companyMemberships/${companyId}`),
        { enabledModules: modules },
        { merge: true },
      );
    });
    appendAudit(
      db,
      companyId,
      {
        actorId: auth.access.user.uid,
        action: "company.modules_changed",
        entityType: "company",
        entityId: companyId,
        metadata: { moduleCount: modules.length },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError ? "Invalid request" : "Could not update apps",
      },
      { status: 400 },
    );
  }
}
