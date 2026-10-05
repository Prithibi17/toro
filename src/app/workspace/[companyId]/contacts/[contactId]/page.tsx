import { notFound } from "next/navigation";
import { ContactRecordForm } from "@/components/contact-record-form";
import {
  authorizeCompany,
  hasPermission,
  isCompanyAdministrator,
} from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { serializeFirestore } from "@/lib/firestore-serialization";

export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; contactId: string }>;
}) {
  const { companyId, contactId } = await params;
  const auth = await authorizeCompany(companyId, { module: "contacts" });
  if (!auth.ok) notFound();
  const db = getAdmin().db,
    ref = db.doc(`companies/${companyId}/contacts/${contactId}`);
  const [
    contact,
    contacts,
    members,
    company,
    related,
    timeline,
    activities,
    addresses,
    customerOpportunities,
    primaryOpportunities,
    meetings,
    sales,
    tags,
  ] = await Promise.all([
    ref.get(),
    db.collection(`companies/${companyId}/contacts`).limit(500).get(),
    db
      .collection(`companies/${companyId}/members`)
      .where("status", "==", "active")
      .limit(500)
      .get(),
    db.doc(`companies/${companyId}`).get(),
    db
      .collection(`companies/${companyId}/contacts`)
      .where("parentContactId", "==", contactId)
      .limit(100)
      .get(),
    db
      .collection(`companies/${companyId}/crmTimeline`)
      .where("entityId", "==", contactId)
      .limit(100)
      .get(),
    db
      .collection(`companies/${companyId}/crmActivities`)
      .where("relatedId", "==", contactId)
      .limit(100)
      .get(),
    ref.collection("addresses").limit(20).get(),
    db
      .collection(`companies/${companyId}/crmOpportunities`)
      .where("customerId", "==", contactId)
      .limit(200)
      .get(),
    db
      .collection(`companies/${companyId}/crmOpportunities`)
      .where("primaryContactId", "==", contactId)
      .limit(200)
      .get(),
    db
      .collection(`companies/${companyId}/calendarEvents`)
      .where("relatedId", "==", contactId)
      .limit(100)
      .get(),
    (auth.access.membership.enabledModules ?? []).includes("sales") &&
    hasPermission(auth.access.membership, "sales.manage")
      ? db
          .collection(`companies/${companyId}/salesOrders`)
          .where("customerId", "==", contactId)
          .limit(200)
          .get()
      : Promise.resolve(null),
    db.collection(`companies/${companyId}/crmTags`).limit(200).get(),
  ]);
  if (!contact.exists || contact.data()?.archived === true) notFound();
  const plain = (doc: FirebaseFirestore.DocumentSnapshot) =>
    serializeFirestore({ id: doc.id, ...doc.data() }) as Record<
      string,
      unknown
    > & { id: string };
  const opportunityDocs = new Map(
    [...customerOpportunities.docs, ...primaryOpportunities.docs].map((doc) => [
      doc.id,
      doc,
    ]),
  );
  const salesValue = (sales?.docs ?? []).reduce(
    (total, doc) =>
      total + Number(doc.data().totalAmount ?? doc.data().amount ?? 0),
    0,
  );
  return (
    <ContactRecordForm
      key={contactId}
      companyId={companyId}
      contact={plain(contact)}
      companies={contacts.docs
        .filter(
          (doc) =>
            doc.data().contactType === "company" &&
            doc.data().archived !== true &&
            doc.id !== contactId,
        )
        .map(plain)}
      members={members.docs.map(plain)}
      sharedTags={tags.docs.map(plain)}
      enabledModules={auth.access.membership.enabledModules ?? []}
      canManage={hasPermission(auth.access.membership, "contacts.manage")}
      canViewAccounting={
        (auth.access.membership.enabledModules ?? []).includes("accounting") &&
        isCompanyAdministrator(auth.access.membership)
      }
      currency={String(company.data()?.currency ?? "INR")}
      address={addresses.docs[0] ? plain(addresses.docs[0]) : undefined}
      related={related.docs.map(plain)}
      events={timeline.docs
        .filter((doc) => doc.data().entityType === "contact")
        .map(plain)}
      activities={activities.docs
        .filter((doc) => doc.data().relatedType === "contact")
        .map(plain)}
      metrics={{
        opportunities: opportunityDocs.size,
        pipelineValue: [...opportunityDocs.values()].reduce(
          (total, doc) =>
            total + Number(doc.data().value ?? doc.data().expectedRevenue ?? 0),
          0,
        ),
        meetings: meetings.size,
        sales: sales?.size ?? 0,
        salesValue,
      }}
    />
  );
}
