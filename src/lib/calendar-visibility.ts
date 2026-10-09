export type CalendarVisibility = "everyone" | "admins";

export function canViewCalendarEvent(
  administrator: boolean,
  event: { visibility?: unknown },
) {
  return event.visibility !== "admins" || administrator;
}

export function canSetCalendarVisibility(
  administrator: boolean,
  visibility: CalendarVisibility | undefined,
) {
  return visibility !== "admins" || administrator;
}
