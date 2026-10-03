import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { crmGrant } from "@/lib/access-policy";
import { CRM_SECTIONS } from "@/lib/crm-model";
import { getAdmin } from "@/lib/firebase-admin";
import { appendAudit } from "@/lib/audit";
const input = z.object({
  enabledSections: z
    .array(
      z.enum(
        CRM_SECTIONS as [
          (typeof CRM_SECTIONS)[number],
          ...(typeof CRM_SECTIONS)[number][],
        ],
      ),
    )
    .min(2),
});
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId, { module: "crm" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  if (crmGrant(auth.access.membership, "pipelines", "manage") !== true)
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const data = input.parse(await req.json());
    const enabled = Array.from(new Set(["overview", ...data.enabledSections]));
    const db = getAdmin().db;
    const batch = db.batch();
    batch.set(
      db.doc(`companies/${companyId}/crmSettings/general`),
      {
        enabledSections: enabled,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.access.user.uid,
      },
      { merge: true },
    );
    appendAudit(
      db,
      companyId,
      {
        actorId: auth.access.user.uid,
        action: "crm.sections_changed",
        entityType: "crmSettings",
        entityId: "general",
        metadata: { sectionCount: enabled.length },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ enabledSections: enabled });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
