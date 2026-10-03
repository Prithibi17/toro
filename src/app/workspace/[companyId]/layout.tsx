import { notFound, redirect } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { WorkspaceShell } from "@/components/workspace-shell";
import { appAllowed } from "@/lib/permission-engine";
import { MODULES } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  let authz;
  try {
    authz = await authorizeCompany(companyId);
  } catch {
    redirect("/select-company");
  }
  if (!authz.ok) notFound();
  const { membership: m, effectivePermissions } = authz.access;
  const modules = MODULES.map((x) => x.key).filter(
    (module) =>
      m.enabledModules?.includes(module) &&
      appAllowed(m, effectivePermissions, module),
  );
  const canManageMembers =
    m.role === "owner" ||
    effectivePermissions.actions["security.members.manage"] === true ||
    effectivePermissions.legacyPermissions["members.manage"] === true;
  const canManageApps =
    m.role === "owner" ||
    effectivePermissions.actions["security.apps.manage"] === true ||
    effectivePermissions.legacyPermissions["apps.manage"] === true;
  return (
    <WorkspaceShell
      companyId={companyId}
      companyName={m.companyName || "Company"}
      role={m.role || "member"}
      modules={modules}
      canManageMembers={canManageMembers}
      canManageApps={canManageApps}
    >
      {children}
    </WorkspaceShell>
  );
}
