import { z } from "zod";
export type CrmItem = Record<string, unknown> & { id: string };
export function normalizePriority(value: unknown) {
  const legacy = ["low", "medium", "high", "urgent"].indexOf(String(value));
  return legacy >= 0 ? legacy : Math.min(3, Math.max(0, Number(value) || 0));
}
function day(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
export function getActivityState(
  activity: Record<string, unknown>,
  now = new Date(),
  timezone = "UTC",
) {
  if (activity.status === "completed") return "done";
  if (activity.status === "cancelled") return "cancelled";
  const due = new Date(
    String(activity.dueAt ?? activity.nextActivityDueAt ?? ""),
  );
  if (Number.isNaN(due.getTime())) return "unscheduled";
  const today = day(now, timezone),
    deadline = day(due, timezone);
  return deadline < today ? "overdue" : deadline === today ? "today" : "future";
}
const querySchema = z
  .object(
    Object.fromEntries(
      [
        "q",
        "mine",
        "unassigned",
        "status",
        "priority",
        "ownerId",
        "salesTeamId",
        "city",
        "country",
        "tag",
        "tagIds",
        "tagMode",
        "activity",
        "rottingDays",
        "sort",
        "groupBy",
        "direction",
        "dateField",
        "dateFrom",
        "dateTo",
        "archived",
        "customerId",
      ].map((key) => [key, z.string().max(500).optional()]),
    ),
  )
  .strict();
export function parseCrmQuery(input: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(querySchema.parse(input)).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, string>;
}
export function filterCrmRecords(
  records: CrmItem[],
  query: Record<string, string>,
  userId: string,
  now = new Date(),
  timezone = "UTC",
) {
  const result = records.filter((r) => {
    if (Boolean(r.archived) !== (query.archived === "true")) return false;
    if (query.mine === "true" && r.ownerId !== userId) return false;
    if (query.unassigned === "true" && r.ownerId) return false;
    if (query.status && (r.status ?? "open") !== query.status) return false;
    if (
      query.priority &&
      normalizePriority(r.priority) < Number(query.priority)
    )
      return false;
    for (const field of [
      "ownerId",
      "salesTeamId",
      "city",
      "country",
      "customerId",
    ])
      if (query[field] && r[field] !== query[field]) return false;
    if (query.tag && !(Array.isArray(r.tags) && r.tags.includes(query.tag)))
      return false;
    const tagIds = (query.tagIds ?? "").split(",").filter(Boolean),
      recordTags = Array.isArray(r.tags) ? r.tags.map(String) : [];
    if (
      tagIds.length &&
      (query.tagMode === "all"
        ? !tagIds.every((id) => recordTags.includes(id))
        : !tagIds.some((id) => recordTags.includes(id)))
    )
      return false;
    if (
      query.activity &&
      getActivityState({ dueAt: r.nextActivityDueAt }, now, timezone) !==
        query.activity
    )
      return false;
    if (
      query.rottingDays &&
      ((r.status ?? "open") !== "open" ||
        now.getTime() -
          new Date(
            String(r.lastMeaningfulAt ?? r.updatedAt ?? r.createdAt),
          ).getTime() <
          Number(query.rottingDays) * 86400000)
    )
      return false;
    const dateField = ["createdAt", "closedAt", "expectedCloseDate"].includes(
      query.dateField,
    )
      ? query.dateField
      : "createdAt";
    const date = String(r[dateField] ?? "").slice(0, 10);
    if (
      (query.dateFrom && date < query.dateFrom) ||
      (query.dateTo && (!date || date > query.dateTo))
    )
      return false;
    if (
      query.q &&
      ![
        "name",
        "email",
        "phone",
        "city",
        "country",
        "source",
        "customerName",
        "ownerName",
        "tags",
        "tagNames",
      ].some((f) =>
        String(r[f] ?? "")
          .toLowerCase()
          .includes(query.q.toLowerCase()),
      )
    )
      return false;
    return true;
  });
  return sortCrmRecords(result, query);
}
export function sortCrmRecords(
  records: CrmItem[],
  query: Record<string, string>,
) {
  const sort = [
    "value",
    "probability",
    "priority",
    "createdAt",
    "updatedAt",
    "expectedCloseDate",
    "name",
  ].includes(query.sort)
    ? query.sort
    : "createdAt";
  return [...records].sort((a, b) => {
    const left =
      sort === "priority" ? normalizePriority(a.priority) : (a[sort] ?? "");
    const right =
      sort === "priority" ? normalizePriority(b.priority) : (b[sort] ?? "");
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return (query.direction === "asc" ? 1 : -1) * comparison;
  });
}
