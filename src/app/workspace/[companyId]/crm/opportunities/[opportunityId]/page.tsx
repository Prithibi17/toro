import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { getAdmin } from "@/lib/firebase-admin";
import { crmGrant, crmRecordAllowed } from "@/lib/access-policy";
import { CRM_COLLECTIONS } from "@/lib/crm-model";
import type { CrmScope } from "@/lib/types";
import { OpportunityRecord } from "@/components/opportunity-record";

const plain = (value: unknown): unknown => {
  if (value && typeof value === "object" && "toDate" in value)
    return (value as { toDate(): Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v)]),
    );
  return value;
};

export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; opportunityId: string }>;
}) {
  const { companyId, opportunityId } = await params,
    ctx = await requireMembership(companyId);
  if (!ctx || !ctx.membership.enabledModules?.includes("crm")) notFound();
  const db = getAdmin().db,
    ref = db.doc(
      `companies/${companyId}/${CRM_COLLECTIONS.opportunities}/${opportunityId}`,
    ),
    doc = await ref.get();
  if (!doc.exists) notFound();
  const scope = crmGrant(ctx.membership, "opportunities", "view");
  if (
    typeof scope !== "string" ||
    !crmRecordAllowed(
      ctx.user.uid,
      ctx.membership,
      scope as CrmScope,
      doc.data()!,
    )
  )
    notFound();
  const opportunity = { id: doc.id, ...doc.data() } as Record<
    string,
    unknown
  > & { id: string };
  const [customer, contact, stage, timeline, activities, all] =
    await Promise.all([
      opportunity.customerId
        ? db
            .doc(`companies/${companyId}/contacts/${opportunity.customerId}`)
            .get()
        : null,
      opportunity.primaryContactId
        ? db
            .doc(
              `companies/${companyId}/contacts/${opportunity.primaryContactId}`,
            )
            .get()
        : null,
      opportunity.stageId
        ? db
            .doc(
              `companies/${companyId}/${CRM_COLLECTIONS.stages}/${opportunity.stageId}`,
            )
            .get()
        : null,
      db
        .collection(`companies/${companyId}/${CRM_COLLECTIONS.timeline}`)
        .where("entityId", "==", opportunityId)
        .limit(200)
        .get(),
      db
        .collection(`companies/${companyId}/${CRM_COLLECTIONS.activities}`)
        .where("relatedId", "==", opportunityId)
        .limit(200)
        .get(),
      db
        .collection(`companies/${companyId}/${CRM_COLLECTIONS.opportunities}`)
        .orderBy("createdAt", "desc")
        .limit(200)
        .get(),
    ]);
  const visible = all.docs.filter((d) =>
      crmRecordAllowed(
        ctx.user.uid,
        ctx.membership,
        scope as CrmScope,
        d.data(),
      ),
    ),
    index = visible.findIndex((d) => d.id === opportunityId);
  return (
    <OpportunityRecord
      companyId={companyId}
      currency="INR"
      opportunity={plain(opportunity) as typeof opportunity}
      customer={
        customer?.exists ? plain({ id: customer.id, ...customer.data() }) : null
      }
      contact={
        contact?.exists ? plain({ id: contact.id, ...contact.data() }) : null
      }
      stage={stage?.exists ? plain({ id: stage.id, ...stage.data() }) : null}
      events={
        plain(timeline.docs.map((d) => ({ id: d.id, ...d.data() }))) as Array<
          Record<string, unknown> & { id: string }
        >
      }
      activities={
        plain(activities.docs.map((d) => ({ id: d.id, ...d.data() }))) as Array<
          Record<string, unknown> & { id: string }
        >
      }
      previousId={index > 0 ? visible[index - 1].id : null}
      nextId={
        index >= 0 && index < visible.length - 1 ? visible[index + 1].id : null
      }
      position={index + 1}
      total={visible.length}
    />
  );
}
