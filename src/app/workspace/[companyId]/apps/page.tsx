import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { AppsManager } from "@/components/apps-manager";
import type { ModuleKey } from "@/lib/types";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const authz = await authorizeCompany(companyId, {
    permission: "apps.manage",
  });
  if (!authz.ok) notFound();
  return (
    <AppsManager
      companyId={companyId}
      initialEnabled={
        (authz.access.membership.enabledModules || []) as ModuleKey[]
      }
      isOwner={true}
    />
  );
}
