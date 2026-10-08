import { describe, expect, it } from "vitest";
import { requiresTodoCompletion, todoDeadlineStatus } from "./todo-deadline";

describe("To-Do deadline status", () => {
  const now = new Date(2026, 9, 9, 23, 45);

  it("classifies future, current, and crossed deadlines by calendar day", () => {
    expect(todoDeadlineStatus("2026-10-10", null, now)).toBe("upcoming");
    expect(todoDeadlineStatus("2026-10-09", null, now)).toBe("today");
    expect(todoDeadlineStatus("2026-10-08", null, now)).toBe("overdue");
  });

  it("does not warn for completed tasks or missing dates", () => {
    expect(todoDeadlineStatus("2026-10-08", "completed", now)).toBeNull();
    expect(todoDeadlineStatus("", null, now)).toBeNull();
  });

  it("keeps warnings only for the current assignee until completion", () => {
    expect(requiresTodoCompletion("assigned", ["assigned"], null)).toBe(true);
    expect(requiresTodoCompletion("previous", ["assigned"], null)).toBe(false);
    expect(requiresTodoCompletion("assigned", ["assigned"], "done")).toBe(false);
  });
});
