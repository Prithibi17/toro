import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { getAdmin } from "@/lib/firebase-admin";
import { CrmWorkspace } from "@/components/crm-workspace";
import { ensureDefaultCrmStages } from "@/lib/crm-defaults";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const ctx = await requireMembership(companyId);
  if (!ctx || !ctx.membership.enabledModules?.includes("crm")) notFound();
  const admin = getAdmin();
  await ensureDefaultCrmStages(admin.db, companyId, ctx.user.uid);
  const company = await admin.db.doc(`companies/${companyId}`).get();
  return (
    <CrmWorkspace
      companyId={companyId}
      currency={company.data()?.currency || "INR"}
    />
  );
}
