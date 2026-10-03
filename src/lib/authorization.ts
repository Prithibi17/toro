import type { Membership, ModuleKey, PermissionKey, SessionUser } from "./types";
import { currentUser } from "./session";
import { getAdmin } from "./firebase-admin";
export { canReadTask, hasPermission, isCompanyAdministrator } from "./access-policy";
import { hasPermission } from "./access-policy";

export type AuthorizationFailure = "unauthenticated" | "not_member" | "module_disabled" | "permission_denied";
export type CompanyAccess = { user: SessionUser; membership: Membership };
export type AuthorizationResult = { ok: true; access: CompanyAccess } | { ok: false; reason: AuthorizationFailure };

export async function authorizeCompany(
  companyId: string,
  requirements: { module?: ModuleKey; permission?: PermissionKey } = {},
): Promise<AuthorizationResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "unauthenticated" };
  const member = await getAdmin().db.doc(`companies/${companyId}/members/${user.uid}`).get();
  if (!member.exists || member.data()?.status !== "active") return { ok: false, reason: "not_member" };
  const membership = member.data() as Membership;
  if (requirements.module && !membership.enabledModules?.includes(requirements.module)) {
    return { ok: false, reason: "module_disabled" };
  }
  if (requirements.permission && !hasPermission(membership, requirements.permission)) {
    return { ok: false, reason: "permission_denied" };
  }
  return { ok: true, access: { user, membership } };
}

export function authorizationStatus(reason: AuthorizationFailure) {
  return reason === "unauthenticated" ? 401 : reason === "module_disabled" ? 404 : 403;
}

export async function activeCompanyMember(companyId: string, userId: string) {
  const member = await getAdmin().db.doc(`companies/${companyId}/members/${userId}`).get();
  return member.exists && member.data()?.status === "active" ? ({ id: member.id, ...member.data() } as Membership & { id: string }) : null;
}

