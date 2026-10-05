import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { serializeFirestore } from "@/lib/firestore-serialization";
import { MemberAccessEditor } from "@/components/member-access-editor";

export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; userId: string }>;
}) {
  const { companyId, userId } = await params;
  const auth = await authorizeCompany(companyId, {
    permission: "members.manage",
  });
  if (!auth.ok) notFound();
  const db = getAdmin().db;
  const [member, departments, company] = await Promise.all([
    db.doc(`companies/${companyId}/members/${userId}`).get(),
    db.collection(`companies/${companyId}/departments`).get(),
    db.doc(`companies/${companyId}`).get(),
  ]);
  if (!member.exists) notFound();
  return (
    <MemberAccessEditor
      companyId={companyId}
      member={serializeFirestore({ id: member.id, ...member.data() })}
      departments={departments.docs.map((doc) => ({
        id: doc.id,
        name: String(doc.data().name ?? "Department"),
      }))}
      enabledModules={company.data()?.enabledModules ?? []}
      isOwner={auth.access.membership.role === "owner"}
    />
  );
}
