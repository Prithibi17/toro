export type TodoDeadlineStatus = "upcoming" | "today" | "overdue";

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todoDeadlineStatus(
  dueDate?: string | null,
  completedAt?: unknown,
  now = new Date(),
): TodoDeadlineStatus | null {
  if (!dueDate || completedAt) return null;
  const due = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const today = dateKey(now);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

export function requiresTodoCompletion(
  userId: string,
  assigneeIds: unknown,
  completedAt?: unknown,
) {
  return (
    !completedAt &&
    Array.isArray(assigneeIds) &&
    assigneeIds.includes(userId)
  );
}

export const deadlinePresentation = {
  upcoming: {
    label: "On schedule",
    textClass: "text-emerald-600",
    dotClass: "bg-emerald-500",
  },
  today: {
    label: "Due today",
    textClass: "text-amber-500",
    dotClass: "bg-amber-400",
  },
  overdue: {
    label: "Overdue",
    textClass: "text-red-500",
    dotClass: "bg-red-500",
  },
} satisfies Record<
  TodoDeadlineStatus,
  { label: string; textClass: string; dotClass: string }
>;
