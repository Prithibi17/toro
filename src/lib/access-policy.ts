import type {
  CrmAction,
  CrmScope,
  CrmSection,
  Membership,
  PermissionKey,
} from "./types";
export function hasPermission(
  membership: Membership,
  permission: PermissionKey,
) {
  return (
    membership.role === "owner" || membership.permissions?.[permission] === true
  );
}
export function isCompanyAdministrator(membership: Membership) {
  return membership.role === "owner" || membership.role === "admin";
}
export function canReadTask(
  userId: string,
  membership: Membership,
  task: {
    creatorId?: string;
    assigneeIds?: string[];
    viewerIds?: string[];
    departmentIds?: string[];
  },
) {
  if (isCompanyAdministrator(membership)) return true;
  if (
    task.creatorId === userId ||
    task.assigneeIds?.includes(userId) ||
    task.viewerIds?.includes(userId)
  )
    return true;
  return (
    membership.role === "manager" &&
    Boolean(
      task.departmentIds?.some((id) => membership.departmentIds?.includes(id)),
    )
  );
}
export function crmGrant(
  membership: Membership,
  section: CrmSection,
  action: CrmAction,
): CrmScope | boolean {
  if (membership.role === "owner")
    return ["view", "edit", "delete", "assign"].includes(action) ? "all" : true;
  const override = membership.crmPermissions?.[section]?.[action];
  if (override !== undefined) return override;
  if (
    membership.permissions?.["crm.manage"] === true ||
    membership.role === "admin"
  )
    return ["view", "edit", "delete", "assign"].includes(action) ? "all" : true;
  if (action === "view")
    return membership.role === "manager" ? "department" : "own";
  return false;
}
export function crmRecordAllowed(
  userId: string,
  membership: Membership,
  scope: CrmScope,
  record: { ownerId?: string; departmentIds?: string[] },
) {
  if (scope === "all") return true;
  if (scope === "own") return record.ownerId === userId;
  if (scope === "department")
    return Boolean(
      record.departmentIds?.some((id) =>
        membership.departmentIds?.includes(id),
      ),
    );
  return false;
}
