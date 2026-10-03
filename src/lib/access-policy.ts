import type { Membership, PermissionKey } from "./types";
export function hasPermission(membership:Membership,permission:PermissionKey){return membership.role==="owner"||membership.permissions?.[permission]===true}
export function isCompanyAdministrator(membership:Membership){return membership.role==="owner"||membership.role==="admin"}
export function canReadTask(userId:string,membership:Membership,task:{creatorId?:string;assigneeIds?:string[];viewerIds?:string[];departmentIds?:string[]}){if(isCompanyAdministrator(membership))return true;if(task.creatorId===userId||task.assigneeIds?.includes(userId)||task.viewerIds?.includes(userId))return true;return membership.role==="manager"&&Boolean(task.departmentIds?.some(id=>membership.departmentIds?.includes(id)))}
