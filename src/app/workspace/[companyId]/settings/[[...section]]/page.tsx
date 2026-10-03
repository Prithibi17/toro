import { notFound, redirect } from "next/navigation";
import { authorizeCompanyPage } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { MODULES, type ModuleKey } from "@/lib/types";
import { serializeFirestore } from "@/lib/firestore-serialization";
import { SettingsWorkspace } from "@/components/settings-workspace";

const sections = new Set([
  "general",
  "company",
  "users",
  "companies",
  "permissions",
  "discuss",
  "calendar",
  "todo",
  "contacts",
  "crm",
  "sales",
  "integrations/email",
  "integrations/calendar",
  "integrations/api",
  "security/authentication",
  "security/sessions",
  "security/audit",
]);

export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; section?: string[] }>;
}) {
  const { companyId, section = [] } = await params;
  const selected = section.join("/") || "general";
  if (!section.length) redirect(`/workspace/${companyId}/settings/general`);
  if (!sections.has(selected)) notFound();
  const authz = await authorizeCompanyPage(companyId);
  if (!authz.ok) notFound();
  const { membership, effectivePermissions } = authz.access;
  const canManageMembers =
    membership.role === "owner" ||
    membership.role === "admin" ||
    effectivePermissions.actions["security.members.manage"] === true ||
    effectivePermissions.legacyPermissions["members.manage"] === true;
  const canManageApps =
    membership.role === "owner" ||
    effectivePermissions.actions["security.apps.manage"] === true ||
    effectivePermissions.legacyPermissions["apps.manage"] === true;
  if (!canManageMembers && !canManageApps) notFound();
  if (
    ([
      "company",
      "users",
      "companies",
      "permissions",
      "integrations/api",
    ].includes(selected) ||
      selected.startsWith("security/") ||
      selected === "permissions" ||
      selected === "users") &&
    !canManageMembers
  )
    notFound();
  const enabledModules = (membership.enabledModules ?? []) as ModuleKey[];
  if (
    MODULES.some((module) => module.key === selected) &&
    !enabledModules.includes(selected as ModuleKey)
  )
    notFound();

  const db = getAdmin().db;
  const needsMembers =
    canManageMembers && ["general", "users"].includes(selected);
  const needsRoles =
    canManageMembers && ["general", "permissions"].includes(selected);
  const needsAudits = canManageMembers && selected === "security/audit";
  const [company, members, roles, audits] = await Promise.all([
    db.doc(`companies/${companyId}`).get(),
    needsMembers ? db.collection(`companies/${companyId}/members`).get() : null,
    needsRoles
      ? db
          .collection(`companies/${companyId}/roles`)
          .where("active", "==", true)
          .get()
      : null,
    needsAudits
      ? db
          .collection(`companies/${companyId}/auditLogs`)
          .orderBy("timestamp", "desc")
          .limit(50)
          .get()
      : null,
  ]);
  if (!company.exists) notFound();
  const companyData = serializeFirestore({
    id: company.id,
    ...company.data(),
  }) as Record<string, unknown>;
  return (
    <SettingsWorkspace
      companyId={companyId}
      selected={selected}
      company={companyData}
      enabledModules={enabledModules}
      canManageMembers={canManageMembers}
      canManageApps={canManageApps}
      members={
        (members?.docs ?? []).map((doc) =>
          serializeFirestore({ id: doc.id, ...doc.data() }),
        ) as Record<string, unknown>[]
      }
      roles={
        (roles?.docs ?? []).map((doc) =>
          serializeFirestore({ id: doc.id, ...doc.data() }),
        ) as Record<string, unknown>[]
      }
      audits={
        (audits?.docs ?? []).map((doc) =>
          serializeFirestore({ id: doc.id, ...doc.data() }),
        ) as Record<string, unknown>[]
      }
    />
  );
}
