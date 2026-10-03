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

export async function authorizeCompany(
  companyId: string,
  requirements: { module?: ModuleKey; permission?: PermissionKey } = {},
): Promise<AuthorizationResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "unauthenticated" };
  const db = getAdmin().db;
  const member = await db
    .doc(`companies/${companyId}/members/${user.uid}`)
    .get();
  if (!member.exists || member.data()?.status !== "active")
    return { ok: false, reason: "not_member" };
  const membership = member.data() as Membership;
  if (accessExpired(membership)) return { ok: false, reason: "access_expired" };
  const roleIds = membership.roleIds ?? [];
  const roleSnapshots = roleIds.length
    ? await db.getAll(
        ...roleIds.map((id) => db.doc(`companies/${companyId}/roles/${id}`)),
      )
    : [];
  const roles = roleSnapshots
    .filter((snap) => snap.exists)
    .map((snap) => ({ id: snap.id, ...snap.data() }) as RoleDefinition);
  const effective = effectivePermissions(membership, roles);
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
    !legacyPermissionAllowed(membership, effective, requirements.permission)
  ) {
    return { ok: false, reason: "permission_denied" };
  }
  const resolvedMembership: Membership = {
    ...membership,
    appAccess: effective.appAccess,
    resourcePermissions: effective.resources,
    actionPermissions: effective.actions,
    fieldPermissions: effective.fields,
    permissions: effective.legacyPermissions,
  };
  return {
    ok: true,
    access: {
      user,
      membership: resolvedMembership,
      effectivePermissions: effective,
    },
  };
}

// Layouts and their pages share this request-scoped access check.
export const authorizeCompanyPage = cache((companyId: string) =>
  authorizeCompany(companyId),
);

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
