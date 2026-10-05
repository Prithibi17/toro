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
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ parentContactId?: string; type?: string }>;
}) {
  const { companyId } = await params;
  const query = await searchParams;
  const auth = await authorizeCompany(companyId, { module: "contacts" });
  if (!auth.ok || !hasPermission(auth.access.membership, "contacts.manage"))
    notFound();
  const db = getAdmin().db;
  const [contacts, members, company, tags] = await Promise.all([
    db.collection(`companies/${companyId}/contacts`).limit(500).get(),
    db
      .collection(`companies/${companyId}/members`)
      .where("status", "==", "active")
      .limit(500)
      .get(),
    db.doc(`companies/${companyId}`).get(),
    db.collection(`companies/${companyId}/crmTags`).limit(200).get(),
  ]);
  const item = (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
    serializeFirestore({ id: doc.id, ...doc.data() }) as Record<
      string,
      unknown
    > & { id: string };
  return (
    <ContactRecordForm
      companyId={companyId}
      draft={{
        contactType: query.type === "person" ? "person" : "company",
        parentContactId: query.parentContactId ?? "",
        ownerId: auth.access.user.uid,
      }}
      companies={contacts.docs
        .filter(
          (doc) =>
            doc.data().contactType === "company" &&
            doc.data().archived !== true,
        )
        .map(item)}
      members={members.docs.map(item)}
      sharedTags={tags.docs.map(item)}
      enabledModules={auth.access.membership.enabledModules ?? []}
      canManage
      currency={String(company.data()?.currency ?? "INR")}
      canViewAccounting={
        (auth.access.membership.enabledModules ?? []).includes("accounting") &&
        isCompanyAdministrator(auth.access.membership)
      }
    />
  );
}
