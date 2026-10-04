import type {
  CrmAction,
  CrmScope,
  CrmSection,
  Membership,
  PermissionKey,
} from "./types";
import {
  effectivePermissions,
  legacyPermissionAllowed,
} from "./permission-engine";
export function hasPermission(
  membership: Membership,
  permission: PermissionKey,
) {
  return legacyPermissionAllowed(
    membership,
    effectivePermissions(membership),
    permission,
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
  const resource =
    membership.resourcePermissions?.[
      `crm.${section === "opportunities" ? "opportunity" : section === "activities" ? "activity" : section.replace(/s$/, "")}`
    ];
  const actionKey = `crm.${section}.${action}`;
  if (["view", "edit", "delete"].includes(action)) {
    const operation =
      action === "view" ? "read" : action === "edit" ? "write" : "delete";
    if (resource?.[operation] === false) return false;
    if (resource?.[operation] === true) {
      const scope = resource.scope;
      if (!scope || scope === "none") return "none";
      if (scope === "company") return "all";
      if (scope === "department") return "department";
      if (scope === "team") return "team";
      if (["own", "assigned", "own_assigned"].includes(scope ?? ""))
        return "own";
    }
  }
  if (membership.actionPermissions?.[actionKey] === false) return false;
  if (action === "create" && resource?.create === false) return false;
  if (action === "create" && resource?.create === true) return true;
  if (membership.actionPermissions?.[actionKey] === true) return true;
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
  record: { ownerId?: string; departmentIds?: string[]; salesTeamId?: string },
) {
  if (scope === "all") return true;
  if (scope === "own") return record.ownerId === userId;
  if (scope === "team")
    return Boolean(
      record.salesTeamId && membership.crmTeamIds?.includes(record.salesTeamId),
    );
  if (scope === "department")
    return Boolean(
      record.departmentIds?.some((id) =>
        membership.departmentIds?.includes(id),
      ),
    );
  return false;
}
