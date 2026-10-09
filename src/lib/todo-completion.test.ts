import { describe, expect, it } from "vitest";
import {
  normalizeCompletionSummary,
  todoAttachmentError,
  TODO_ATTACHMENT_MAX_BYTES,
  TODO_ATTACHMENT_CHUNK_BYTES,
  canPostTodoProgress,
  canChangeTodoStage,
  splitTodoAttachmentBytes,
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

  it("splits free-plan attachments into Firestore-safe documents", () => {
    const bytes = new Uint8Array(TODO_ATTACHMENT_CHUNK_BYTES * 2 + 17);
    const chunks = splitTodoAttachmentBytes(bytes);
    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([
      TODO_ATTACHMENT_CHUNK_BYTES,
      TODO_ATTACHMENT_CHUNK_BYTES,
      17,
    ]);
  });

  it("allows progress updates only from an assigned employee", () => {
    expect(canPostTodoProgress("assigned", ["assigned"])).toBe(true);
    expect(canPostTodoProgress("creator", ["assigned"])).toBe(false);
    expect(canPostTodoProgress("owner", undefined)).toBe(false);
  });

  it("allows stage changes only for the assigner or assignee", () => {
    const task = {
      assignedById: "assigner",
      creatorId: "creator",
      assigneeIds: ["assignee"],
    };
    expect(canChangeTodoStage("assigner", task)).toBe(true);
    expect(canChangeTodoStage("assignee", task)).toBe(true);
    expect(canChangeTodoStage("creator", task)).toBe(false);
    expect(canChangeTodoStage("admin", task)).toBe(false);
  });

  it("uses the creator as the assigner for legacy To-Dos", () => {
    expect(
      canChangeTodoStage("creator", {
        creatorId: "creator",
        assigneeIds: ["assignee"],
      }),
    ).toBe(true);
  });
});
