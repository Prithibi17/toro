import type {
  AppAccessLevel,
  FieldPermission,
  Membership,
  ModuleKey,
  PermissionKey,
  RecordScope,
  ResourceOperation,
  ResourcePermission,
  RoleDefinition,
} from "./types";

const legacyRegistry: Record<
  PermissionKey,
  { resource?: string; operation?: ResourceOperation; action?: string }
> = {
  "members.manage": { action: "security.members.manage" },
  "security.manage": { action: "security.roles.manage" },
  "apps.manage": { action: "security.apps.manage" },
  "tasks.create": { resource: "todo.task", operation: "create" },
  "tasks.move": { action: "todo.task.move" },
  "tasks.assign": { action: "todo.task.assign" },
  "crm.manage": { action: "crm.configure" },
  "contacts.manage": { action: "contacts.manage" },
  "sales.manage": { action: "sales.manage" },
};

const levelRank: Record<AppAccessLevel, number> = {
  none: 0,
  user: 1,
  custom: 1,
  manager: 2,
  administrator: 3,
};
const scopeRank: Record<RecordScope, number> = {
  none: 0,
  own: 1,
  assigned: 1,
  own_assigned: 2,
  team: 3,
  department: 4,
  company: 5,
};

export type EffectivePermissions = {
  appAccess: Partial<Record<ModuleKey, AppAccessLevel>>;
  resources: Record<string, ResourcePermission>;
  actions: Record<string, boolean>;
  fields: Record<string, Record<string, FieldPermission>>;
  legacyPermissions: Partial<Record<PermissionKey, boolean>>;
  approvalLimits: Record<string, number>;
  roleIds: string[];
};

function mergeRole(target: EffectivePermissions, role: RoleDefinition) {
  for (const [app, level] of Object.entries(role.appAccess ?? {}) as [
    ModuleKey,
    AppAccessLevel,
  ][]) {
    if (levelRank[level] > levelRank[target.appAccess[app] ?? "none"])
      target.appAccess[app] = level;
  }
  for (const [resource, grant] of Object.entries(role.resources ?? {})) {
    const current = (target.resources[resource] ??= {});
    for (const operation of ["read", "create", "write", "delete"] as const) {
      if (grant[operation] === true) current[operation] = true;
    }
    if (
      grant.scope &&
      scopeRank[grant.scope] > scopeRank[current.scope ?? "none"]
    )
      current.scope = grant.scope;
  }
  for (const [action, allowed] of Object.entries(role.actions ?? {}))
    if (allowed) target.actions[action] = true;
  for (const [resource, fields] of Object.entries(role.fields ?? {})) {
    const resourceFields = (target.fields[resource] ??= {});
    for (const [field, grant] of Object.entries(fields)) {
      const current = (resourceFields[field] ??= {});
      if (grant.read) current.read = true;
      if (grant.write) current.write = true;
      if (grant.mask) current.mask = true;
    }
  }
  for (const [key, allowed] of Object.entries(role.legacyPermissions ?? {}) as [
    PermissionKey,
    boolean,
  ][])
    if (allowed) target.legacyPermissions[key] = true;
  for (const [policy, limit] of Object.entries(role.approvalLimits ?? {}))
    target.approvalLimits[policy] = Math.max(
      target.approvalLimits[policy] ?? 0,
      limit,
    );
}

export function resolveRoleGraph(roleIds: string[], roles: RoleDefinition[]) {
  const byId = new Map(roles.map((role) => [role.id, role]));
  const resolved: RoleDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Role inheritance cycle detected");
    if (visited.has(id)) return;
    const role = byId.get(id);
    if (!role || role.active === false) return;
    visiting.add(id);
    for (const parent of role.inheritedRoleIds ?? []) visit(parent);
    visiting.delete(id);
    visited.add(id);
    resolved.push(role);
  }
  roleIds.forEach(visit);
  return resolved;
}

export function effectivePermissions(
  membership: Membership,
  roles: RoleDefinition[] = [],
): EffectivePermissions {
  const result: EffectivePermissions = {
    appAccess: {},
    resources: {},
    actions: {},
    fields: {},
    legacyPermissions: {},
    approvalLimits: {},
    roleIds: [],
  };
  const resolved = resolveRoleGraph(membership.roleIds ?? [], roles);
  result.roleIds = resolved.map((role) => role.id);
  resolved.forEach((role) => mergeRole(result, role));
  mergeRole(result, {
    id: "membership-overrides",
    name: "Membership overrides",
    appAccess: membership.appAccess,
    resources: membership.resourcePermissions,
    actions: membership.actionPermissions,
    fields: membership.fieldPermissions,
    legacyPermissions: membership.permissions,
  });
  Object.assign(result.appAccess, membership.appAccess);
  Object.assign(result.actions, membership.actionPermissions);
  Object.assign(result.legacyPermissions, membership.permissions);
  for (const [resource, override] of Object.entries(
    membership.resourcePermissions ?? {},
  )) {
    result.resources[resource] = {
      ...(result.resources[resource] ?? {}),
      ...override,
    };
  }
  for (const [resource, fields] of Object.entries(
    membership.fieldPermissions ?? {},
  )) {
    const current = (result.fields[resource] ??= {});
    for (const [field, override] of Object.entries(fields)) {
      current[field] = { ...(current[field] ?? {}), ...override };
    }
  }
  return result;
}

export function accessExpired(membership: Membership, now = new Date()) {
  const raw = membership.accessExpiresAt;
  if (!raw) return false;
  const date =
    raw instanceof Date
      ? raw
      : typeof raw === "string"
        ? new Date(raw)
        : raw.toDate();
  return date.getTime() <= now.getTime();
}

export function appAllowed(
  membership: Membership,
  effective: EffectivePermissions,
  module: ModuleKey,
) {
  if (membership.userType === "portal") return false;
  if (membership.role === "owner") return true;
  const configured = effective.appAccess[module];
  if (configured) return configured !== "none";
  return membership.enabledModules?.includes(module) ?? false;
}

export function legacyPermissionAllowed(
  membership: Membership,
  effective: EffectivePermissions,
  permission: PermissionKey,
) {
  if (membership.role === "owner") return true;
  if (effective.legacyPermissions[permission]) return true;
  const registered = legacyRegistry[permission];
  return registered.action
    ? effective.actions[registered.action] === true
    : registered.resource && registered.operation
      ? effective.resources[registered.resource]?.[registered.operation] ===
        true
      : false;
}

export function resourceAllowed(
  effective: EffectivePermissions,
  resource: string,
  operation: ResourceOperation,
) {
  return effective.resources[resource]?.[operation] === true;
}

export function filterReadableFields<T extends Record<string, unknown>>(
  effective: EffectivePermissions,
  resource: string,
  record: T,
) {
  const policy = effective.fields[resource];
  if (!policy) return record;
  return Object.fromEntries(
    Object.entries(record).filter(([field]) => policy[field]?.read === true),
  ) as Partial<T>;
}

export function rejectUnwritableFields(
  effective: EffectivePermissions,
  resource: string,
  fields: string[],
) {
  const policy = effective.fields[resource];
  return policy ? fields.filter((field) => policy[field]?.write !== true) : [];
}
