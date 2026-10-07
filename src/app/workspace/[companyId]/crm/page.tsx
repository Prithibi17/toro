import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { CrmWorkspace } from "@/components/crm-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const result = await authorizeCompany(companyId, { module: "crm" });
  if (!result.ok) notFound();
  return <CrmWorkspace companyId={companyId} currency="INR" />;
}
