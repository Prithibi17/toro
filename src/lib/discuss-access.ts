import type { Membership } from "./types";

export function canAccessConversation(
  uid: string,
  membership: Membership,
  channel: FirebaseFirestore.DocumentData,
) {
  if (channel.archived === true || membership.userType === "portal")
    return false;
  if (channel.type === "public" || !channel.type) return true;
  if ((channel.memberIds || []).includes(uid)) return true;
  if (
    channel.type === "department" &&
    channel.departmentId &&
    (membership.departmentIds || []).includes(channel.departmentId)
  )
    return true;
  return false;
}

export function canonicalDirectMessageId(userA: string, userB: string) {
  return `dm_${[userA, userB].sort().join("_")}`;
}

export function messageMentions(body: string) {
  return Array.from(
    new Set(
      [...body.matchAll(/@\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => match[2]),
    ),
  );
}
