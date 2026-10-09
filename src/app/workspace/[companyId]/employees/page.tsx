import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { EmployeeManager } from "@/components/employee-manager";
import { can } from "@/lib/can";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const authz = await authorizeCompany(companyId);
  if (!authz.ok) notFound();
  const canManageMembers =
    can(authz.access, "employees.manage") ||
    authz.access.effectivePermissions.actions["security.members.manage"] === true ||
    authz.access.effectivePermissions.legacyPermissions["members.manage"] === true;
  const canInviteMembers = can(authz.access, "employees.invite");
  const canViewEmployees =
    canManageMembers ||
    canInviteMembers ||
    can(authz.access, "employees.view");
  if (!canViewEmployees) notFound();
  const db = getAdmin().db;
  const [members, departments, invitations, roles, company] = await Promise.all(
    [
      db.collection(`companies/${companyId}/members`).get(),
      db.collection(`companies/${companyId}/departments`).get(),
      canInviteMembers || canManageMembers
        ? db
            .collection(`companies/${companyId}/invitations`)
            .where("status", "==", "pending")
            .get()
        : null,
      canInviteMembers || canManageMembers
        ? db
            .collection(`companies/${companyId}/roles`)
            .where("active", "==", true)
            .get()
        : null,
      db.doc(`companies/${companyId}`).get(),
    ],
  );
  return (
    <EmployeeManager
      companyId={companyId}
      companyName={String(company.data()?.name ?? "this workspace")}
      canManageDepartments={["owner", "admin"].includes(authz.access.membership.role)}
      canManageMembers={canManageMembers}
      canInviteMembers={canInviteMembers}
      initialInvitations={(invitations?.docs ?? []).map((d) => ({
        id: d.id,
        email: d.data().email,
        displayName: d.data().displayName,
        role: d.data().role,
        status: d.data().status,
      }))}
      roles={(roles?.docs ?? []).map((d) => ({
        id: d.id,
        name: String(d.data().name),
        description: d.data().description,
      }))}
      initialMembers={members.docs.map((d) => ({
        id: d.id,
        displayName: d.data().displayName,
        email: d.data().email,
        role: d.data().role,
        status: d.data().status,
        departmentIds: d.data().departmentIds ?? [],
        jobTitle: d.data().jobTitle ?? d.data().employmentType,
        idFinderConnection: d.data().idFinderConnection,
      }))}
      departments={departments.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        workDays: d.data().workDays ?? [1, 2, 3, 4, 5, 6],
      }))}
    />
  );
}
