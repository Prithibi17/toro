import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { CrmWorkspace } from "@/components/crm-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const result = await authorizeCompany(companyId, { module: "crm" });
  if (!result.ok) notFound();
  const admin = getAdmin();
  const company = await admin.db.doc(`companies/${companyId}`).get();
  return (
    <CrmWorkspace
      companyId={companyId}
      currency={company.data()?.currency || "INR"}
    />
  );
}
