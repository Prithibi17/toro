import type {
  Membership,
  ModuleKey,
  PermissionKey,
  RoleDefinition,
  SessionUser,
} from "./types";
import { cache } from "react";
import { currentUser } from "./session";
import { getAdmin } from "./firebase-admin";
export {
  canReadTask,
  hasPermission,
  isCompanyAdministrator,
} from "./access-policy";
import {
  accessExpired,
  appAllowed,
  effectivePermissions,
  legacyPermissionAllowed,
  type EffectivePermissions,
} from "./permission-engine";
import { simplePermissionAllowed } from "./permission-catalog";

const simpleLegacyPermission: Partial<Record<PermissionKey, string>> = {
  "members.manage": "employees.manage",
  "tasks.assign": "todo.assign",
  "crm.manage": "crm.pipeline.configure",
  "contacts.manage": "contacts.create",
  "sales.manage": "sales.quotation.create",
};

export type AuthorizationFailure =
  | "unauthenticated"
  | "not_member"
  | "access_expired"
  | "module_disabled"
  | "permission_denied";
export type CompanyAccess = {
  user: SessionUser;
  membership: Membership;
  effectivePermissions: EffectivePermissions;
};
export type AuthorizationResult =
  | { ok: true; access: CompanyAccess }
  | { ok: false; reason: AuthorizationFailure };

// Layouts and pages execute in the same React server-render request. Resolve
// identity, membership and roles once so nested routes do not repeat the same
// remote Firestore reads during every navigation.
const resolveCompanyAccess = cache(
  async (companyId: string): Promise<AuthorizationResult> => {
    const user = await currentUser();
    if (!user) return { ok: false, reason: "unauthenticated" };
    const db = getAdmin().db;
    const member = await db
      .doc(`companies/${companyId}/members/${user.uid}`)
      .get();
    if (!member.exists || member.data()?.status !== "active")
      return { ok: false, reason: "not_member" };
    const membership = member.data() as Membership;
    if (accessExpired(membership))
      return { ok: false, reason: "access_expired" };
    const roleIds = membership.roleIds ?? [];
    const roleSnapshots = roleIds.length
      ? await db.getAll(
          ...roleIds.map((id) => db.doc(`companies/${companyId}/roles/${id}`)),
        )
      : [];
    const roles = roleSnapshots
      .filter((snapshot) => snapshot.exists)
      .map(
        (snapshot) =>
          ({ id: snapshot.id, ...snapshot.data() }) as RoleDefinition,
      );
    const effective = effectivePermissions(membership, roles);
    return {
      ok: true,
      access: {
        user,
        membership: {
          ...membership,
          appAccess: effective.appAccess,
          resourcePermissions: effective.resources,
          actionPermissions: effective.actions,
          fieldPermissions: effective.fields,
          permissions: effective.legacyPermissions,
          crmTeamIds: [],
        },
        effectivePermissions: effective,
      },
    };
  },
);

export async function authorizeCompany(
  companyId: string,
  requirements: { module?: ModuleKey; permission?: PermissionKey } = {},
): Promise<AuthorizationResult> {
  const resolved = await resolveCompanyAccess(companyId);
  if (!resolved.ok) return resolved;
  const { user, membership, effectivePermissions: effective } = resolved.access;
  const db = getAdmin().db;
  if (
    requirements.module &&
    !(membership.enabledModules ?? []).includes(requirements.module)
  ) {
    return { ok: false, reason: "module_disabled" };
  }
  if (
    requirements.module &&
    !appAllowed(membership, effective, requirements.module)
  )
    return { ok: false, reason: "permission_denied" };
  if (
    requirements.permission &&
    !permissionAllowed(
      membership,
      effective,
      requirements.permission,
    )
  ) {
    return { ok: false, reason: "permission_denied" };
  }
  const resolvedMembership: Membership = { ...membership };
  const needsCrmTeams =
    Object.entries(effective.resources).some(
      ([resource, grant]) =>
        resource.startsWith("crm.") && grant.scope === "team",
    ) ||
    Object.values(membership.crmPermissions ?? {}).some((grants) =>
      Object.values(grants).includes("team"),
    );
  if (requirements.module === "crm" && needsCrmTeams) {
    const teams = await db
      .collection(`companies/${companyId}/crmSalesTeams`)
      .where("memberIds", "array-contains", user.uid)
      .get();
    resolvedMembership.crmTeamIds = teams.docs
      .filter((doc) => doc.data().active !== false)
      .map((doc) => doc.id);
  }
  return {
    ok: true,
    access: {
      user,
      membership: resolvedMembership,
      effectivePermissions: effective,
    },
  };
}

function permissionAllowed(
  membership: Membership,
  effective: EffectivePermissions,
  permission: PermissionKey,
) {
  const simple = simpleLegacyPermission[permission];
  if (!simple) return legacyPermissionAllowed(membership, effective, permission);
  if (membership.permissionOverrides?.[simple])
    return simplePermissionAllowed(membership, simple);
  return (
    simplePermissionAllowed(membership, simple) ||
    legacyPermissionAllowed(membership, effective, permission)
  );
}

// Layouts and their pages share this request-scoped access check.
export const authorizeCompanyPage = (companyId: string) =>
  authorizeCompany(companyId);

export function authorizationStatus(reason: AuthorizationFailure) {
  return reason === "unauthenticated"
    ? 401
    : reason === "module_disabled"
      ? 404
      : 403;
}

export async function activeCompanyMember(companyId: string, userId: string) {
  const member = await getAdmin()
    .db.doc(`companies/${companyId}/members/${userId}`)
    .get();
  return member.exists && member.data()?.status === "active"
    ? ({ id: member.id, ...member.data() } as Membership & { id: string })
    : null;
}
