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
import { simplePermissionAllowed } from "./permission-catalog";
export function hasPermission(
  membership: Membership,
  permission: PermissionKey,
) {
  const simpleKey: Partial<Record<PermissionKey, string>> = {
    "members.manage": "employees.manage",
    "tasks.assign": "todo.assign",
    "crm.manage": "crm.pipeline.configure",
    "contacts.manage": "contacts.create",
    "sales.manage": "sales.quotation.create",
  };
  const mapped = simpleKey[permission];
  if (mapped && membership.permissionOverrides?.[mapped])
    return simplePermissionAllowed(membership, mapped);
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
  _userId: string,
  membership: Membership,
  _task: {
    creatorId?: string;
    assigneeIds?: string[];
    viewerIds?: string[];
    departmentIds?: string[];
  },
) {
  void _task;
  // Toro's To-Do directory is company-visible by design. Mutation permissions
  // remain independently enforced by the task routes.
  return membership.status === "active" && membership.userType !== "portal";
}
export function crmGrant(
  membership: Membership,
  section: CrmSection,
  action: CrmAction,
): CrmScope | boolean {
  if (membership.role === "owner")
    return ["view", "edit", "delete", "assign"].includes(action) ? "all" : true;
  const simpleKey =
    section === "opportunities" && action === "view"
      ? "crm.opportunity.company_view"
      : section === "opportunities" && action === "assign"
        ? "crm.opportunity.assign"
        : section === "opportunities" && action === "delete"
          ? "crm.opportunity.delete"
          : section === "pipelines" && action === "manage"
            ? "crm.pipeline.configure"
            : null;
  if (simpleKey === "crm.opportunity.delete") {
    const allowed = simplePermissionAllowed(
      membership,
      simpleKey,
      "crm",
    );
    return allowed ? "all" : false;
  }
  if (simpleKey && membership.permissionOverrides?.[simpleKey]) {
    const allowed = simplePermissionAllowed(membership, simpleKey, "crm");
    if (!allowed) return action === "view" ? "none" : false;
    return ["view", "edit", "delete", "assign"].includes(action) ? "all" : true;
  }
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
  if (action === "create") return true;
  if (action === "edit")
    return membership.role === "manager" ? "department" : "own";
  if (action === "moveStage" || action === "close") return true;
  if (action === "assign") return membership.role === "manager";
  if (action === "delete")
    return membership.role === "manager" ? "department" : false;
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
