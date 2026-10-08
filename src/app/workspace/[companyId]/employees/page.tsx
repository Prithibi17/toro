import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { EmployeeManager } from "@/components/employee-manager";
import { simplePermissionAllowed } from "@/lib/permission-catalog";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const authz = await authorizeCompany(companyId, {
    permission: "members.manage",
  });
  if (!authz.ok) notFound();
  const db = getAdmin().db;
  const [members, departments, invitations, roles, company] = await Promise.all(
    [
      db.collection(`companies/${companyId}/members`).get(),
      db.collection(`companies/${companyId}/departments`).get(),
      db
        .collection(`companies/${companyId}/invitations`)
        .where("status", "==", "pending")
        .get(),
      db
        .collection(`companies/${companyId}/roles`)
        .where("active", "==", true)
        .get(),
      db.doc(`companies/${companyId}`).get(),
    ],
  );
  return (
    <EmployeeManager
      companyId={companyId}
      companyName={String(company.data()?.name ?? "this workspace")}
      canManageDepartments={["owner", "admin"].includes(authz.access.membership.role)}
      canInviteMembers={
        ["owner", "admin"].includes(authz.access.membership.role) ||
        simplePermissionAllowed(authz.access.membership, "employees.invite")
      }
      initialInvitations={invitations.docs.map((d) => ({
        id: d.id,
        email: d.data().email,
        displayName: d.data().displayName,
        role: d.data().role,
        status: d.data().status,
      }))}
      roles={roles.docs.map((d) => ({
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
