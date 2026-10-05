import type { CompanyAccess } from "./authorization";
import { appAllowed } from "./permission-engine";
import {
  SIMPLE_PERMISSIONS,
  simplePermissionAllowed,
} from "./permission-catalog";
import type { ModuleKey } from "./types";

/**
 * Central entry point for Toro's human-facing permissions.
 * API routes may pass a stable catalog key and optionally the owning app.
 * App OFF and membership validity are evaluated before CAN/CANNOT overrides.
 */
export function can(
  access: CompanyAccess,
  permissionKey: string,
  app?: ModuleKey,
) {
  if (app && !appAllowed(access.membership, access.effectivePermissions, app))
    return false;
  const permission = SIMPLE_PERMISSIONS.find(
    (candidate) => candidate.key === permissionKey,
  );
  if (!permission) return false;
  return simplePermissionAllowed(
    access.membership,
    permissionKey,
    permission.app,
  );
}
