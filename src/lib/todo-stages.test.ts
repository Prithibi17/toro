import { describe, expect, it } from "vitest";
import { resolveTodoStageId } from "./todo-stages";

const stages = [
  { id: "my-todo", legacyStatus: "todo", isDone: false },
  { id: "my-progress", legacyStatus: "in-progress", isDone: false },
  { id: "my-done", legacyStatus: "done", isDone: true },
  { id: "my-custom", isDone: false },
];

describe("resolveTodoStageId", () => {
  it("keeps a personal custom stage when it belongs to the viewer", () => {
    expect(
      resolveTodoStageId(
        { stageId: "my-custom", status: "todo", completedAt: null },
        stages,
      ),
    ).toBe("my-custom");
  });

  it("maps another user's stage through the shared workflow status", () => {
    expect(
      resolveTodoStageId(
        { stageId: "their-progress", status: "in-progress" },
        stages,
      ),
    ).toBe("my-progress");
  });

  it("shows completed work in the viewer's own done stage", () => {
    expect(
      resolveTodoStageId(
        {
          stageId: "their-done",
          status: "done",
          completedAt: "2026-10-10T19:24:29.501Z",
        },
        stages,
      ),
    ).toBe("my-done");
  });

  it("uses the first stage only when no equivalent exists", () => {
    expect(
      resolveTodoStageId({ stageId: "their-custom", status: "unknown" }, stages),
    ).toBe("my-todo");
  });
});
