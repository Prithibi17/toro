import type { Membership } from "./types";

type TargetMember = { id: string; status?: string; departmentIds?: string[] };

export function canAssignTodoTo(
  userId: string,
  membership: Membership,
  target: TargetMember,
) {
  if (target.status !== "active") return false;
  if (target.id === userId) return true;
  if (membership.actionPermissions?.["todo.task.assign"] === false)
    return false;
  if (
    membership.role === "owner" ||
    membership.role === "admin" ||
    membership.actionPermissions?.["todo.task.assign"] === true
  )
    return true;
  if (membership.role !== "manager") return false;
  const departments = new Set(membership.departmentIds ?? []);
  return Boolean(target.departmentIds?.some((id) => departments.has(id)));
}
