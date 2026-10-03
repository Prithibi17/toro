import { notFound } from "next/navigation";
import { authorizeCompany } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { EmployeeManager } from "@/components/employee-manager";
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
  const [members, departments, invitations, roles] = await Promise.all([
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
  ]);
  return (
    <EmployeeManager
      companyId={companyId}
      isOwner={authz.access.membership.role === "owner"}
      pending={invitations.size}
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
      }))}
      departments={departments.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
      }))}
    />
  );
}
