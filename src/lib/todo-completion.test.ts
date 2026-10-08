import { describe, expect, it } from "vitest";
import {
  normalizeCompletionSummary,
  todoAttachmentError,
  TODO_ATTACHMENT_MAX_BYTES,
  canPostTodoProgress,
} from "./todo-completion";

describe("To-Do completion", () => {
  it("requires and normalizes a completion summary", () => {
    expect(normalizeCompletionSummary("  Work delivered  ")).toBe("Work delivered");
    expect(() => normalizeCompletionSummary("   ")).toThrow("completion summary");
  });

  it("accepts only supported attachments within the size limit", () => {
    expect(todoAttachmentError({ size: 100, type: "application/pdf" })).toBeNull();
    expect(todoAttachmentError({ size: TODO_ATTACHMENT_MAX_BYTES + 1, type: "application/pdf" })).toContain("4 MB");
    expect(todoAttachmentError({ size: 100, type: "application/x-msdownload" })).toBe("Unsupported file type");
  });

  it("allows progress updates only from an assigned employee", () => {
    expect(canPostTodoProgress("assigned", ["assigned"])).toBe(true);
    expect(canPostTodoProgress("creator", ["assigned"])).toBe(false);
    expect(canPostTodoProgress("owner", undefined)).toBe(false);
  });
});
