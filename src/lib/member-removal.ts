import type { Membership } from "./types";

type Target = { id: string; role?: string; status?: string };

export function memberRemovalError(
  actorId: string,
  actor: Membership,
  target: Target,
  activeAdministratorCount: number,
) {
  if (target.status !== "active") return "Member is not active";
  if (target.role === "owner")
    return "You cannot remove the workspace owner. Transfer ownership first.";
  if (
    actorId === target.id &&
    ["owner", "admin"].includes(target.role ?? "") &&
    activeAdministratorCount <= 1
  )
    return "The last workspace administrator cannot be removed.";
  if (actor.role !== "owner" && target.role === "admin")
    return "Only the workspace owner can remove an administrator.";
  return null;
}
