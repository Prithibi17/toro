export const TODO_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const TODO_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function normalizeCompletionSummary(value: string) {
  const summary = value.trim();
  if (!summary || summary.length > 2000)
    throw new Error("Enter a completion summary up to 2,000 characters");
  return summary;
}

export function todoAttachmentError(file: { size: number; type: string }) {
  if (!file.size || file.size > TODO_ATTACHMENT_MAX_BYTES)
    return "Select one file up to 4 MB";
  if (!TODO_ATTACHMENT_TYPES.has(file.type)) return "Unsupported file type";
  return null;
}

export function canPostTodoProgress(userId: string, assigneeIds: unknown) {
  return Array.isArray(assigneeIds) && assigneeIds.includes(userId);
}
