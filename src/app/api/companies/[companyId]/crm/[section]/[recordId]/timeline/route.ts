import { NextResponse } from "next/server";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { crmGrant, crmRecordAllowed } from "@/lib/access-policy";
import {
  CRM_COLLECTIONS,
  sectionInputs,
  type CrmEntitySection,
} from "@/lib/crm-model";
import { getAdmin } from "@/lib/firebase-admin";
import { crmEntityType } from "@/lib/crm-workflow";
import type { CrmScope, CrmSection } from "@/lib/types";

export async function GET(
  _: Request,
  {
    params,
  }: {
    params: Promise<{ companyId: string; section: string; recordId: string }>;
  },
) {
  const { companyId, section, recordId } = await params;
  if (!(section in sectionInputs) || section === "pipelines")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await authorizeCompany(companyId, { module: "crm" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  const grant = crmGrant(auth.access.membership, section as CrmSection, "view");
  if (grant === false || grant === "none")
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const db = getAdmin().db;
  const record = await db
    .doc(
      `companies/${companyId}/${CRM_COLLECTIONS[section as CrmEntitySection]}/${recordId}`,
    )
    .get();
  if (!record.exists)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (
    !crmRecordAllowed(
      auth.access.user.uid,
      auth.access.membership,
      grant as CrmScope,
      record.data()!,
    )
  )
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const entityType = crmEntityType(section);
  const timeline = await db
    .collection(`companies/${companyId}/${CRM_COLLECTIONS.timeline}`)
    .where("entityId", "==", recordId)
    .limit(200)
    .get();
  const events = timeline.docs
    .filter((doc) => doc.data().entityType === entityType)
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.()?.toISOString() ?? null,
    }))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return NextResponse.json({ events });
}
