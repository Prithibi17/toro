import { notFound } from "next/navigation";
import { OpportunityRecord } from "@/components/opportunity-record";
import {
  opportunityAccess,
  crmAllowed,
  plainDoc,
  crmReadable,
  readableHistory,
  CrmError,
} from "@/lib/crm-server";
import { getAdmin } from "@/lib/firebase-admin";
import { hasPermission } from "@/lib/access-policy";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; opportunityId: string }>;
}) {
  const { companyId, opportunityId } = await params;
  let ctx;
  try {
    ctx = await opportunityAccess(companyId, opportunityId);
  } catch (e) {
    if (e instanceof CrmError && [401, 403, 404].includes(e.status)) notFound();
    throw e;
  }
  const { access, record } = ctx,
    db = getAdmin().db;
  const names = [
    "crmPipelineStages",
    "members",
    "crmSalesTeams",
    "contacts",
    "crmLostReasons",
  ] as const;
  const [collections, events, activities, quotations, files, company] =
    await Promise.all([
      Promise.all(
        names.map((n) =>
          db.collection(`companies/${companyId}/${n}`).limit(500).get(),
        ),
      ),
      db
        .collection(`companies/${companyId}/crmTimeline`)
        .where("entityId", "==", opportunityId)
        .get(),
      db
        .collection(`companies/${companyId}/crmActivities`)
        .where("relatedId", "==", opportunityId)
        .get(),
      access.membership.enabledModules.includes("sales") &&
      hasPermission(access.membership, "sales.manage")
        ? db
            .collection(`companies/${companyId}/salesOrders`)
            .where("opportunityId", "==", opportunityId)
            .get()
        : null,
      db
        .collection(`companies/${companyId}/files`)
        .where("opportunityId", "==", opportunityId)
        .get(),
      db.doc(`companies/${companyId}`).get(),
    ]);
  const contacts = collections[3].docs
    .filter((d) => crmAllowed(access, "contacts", "view", d.data()))
    .map((d) => crmReadable(access, plainDoc(d), "contacts.contact"));
  return (
    <OpportunityRecord
      key={opportunityId}
      companyId={companyId}
      currency={company.data()?.currency ?? "INR"}
      timezone={company.data()?.timezone ?? "UTC"}
      opportunity={crmReadable(access, record)}
      contacts={contacts}
      stages={collections[0].docs
        .filter((d) => d.data().active !== false)
        .map(plainDoc)
        .sort(
          (a, b) =>
            Number(a.sequence ?? a.order ?? 0) -
            Number(b.sequence ?? b.order ?? 0),
        )}
      members={collections[1].docs
        .filter((d) => d.data().status === "active")
        .map((d) => ({
          id: d.id,
          displayName: d.data().displayName ?? d.data().email ?? "Member",
        }))}
      teams={collections[2].docs.map(plainDoc)}
      lostReasons={collections[4].docs
        .filter((d) => d.data().active !== false)
        .map(plainDoc)}
      events={events.docs
        .filter((d) => d.data().entityType === "opportunity")
        .map((d) => readableHistory(access, plainDoc(d)))}
      activities={activities.docs
        .filter(
          (d) =>
            d.data().relatedType === "opportunity" &&
            crmAllowed(access, "activities", "view", d.data()),
        )
        .map((d) => ({
          ...plainDoc(d),
          canEdit: crmAllowed(access, "activities", "edit", d.data()),
        }))}
      quotations={(quotations?.docs ?? []).map(plainDoc)}
      files={files.docs.map(plainDoc)}
      permissions={{
        edit: crmAllowed(access, "opportunities", "edit", record),
        move: crmAllowed(access, "opportunities", "moveStage", record),
        close: crmAllowed(access, "opportunities", "close", record),
        assign: crmAllowed(access, "opportunities", "assign", record),
        activity: crmAllowed(access, "activities", "create"),
        note: crmAllowed(access, "opportunities", "edit", record),
        quotation:
          access.membership.enabledModules.includes("sales") &&
          hasPermission(access.membership, "sales.manage"),
      }}
    />
  );
}
