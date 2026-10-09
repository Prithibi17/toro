import { describe, expect, it } from "vitest";
import type { Membership } from "./types";
import { canAssignTodoTo } from "./todo-assignment";

const member = (overrides: Partial<Membership> = {}) =>
  ({ role: "employee", status: "active", ...overrides }) as Membership;

describe("To-Do assignment policy", () => {
  it("always permits an active self assignment", () => {
    expect(
      canAssignTodoTo("me", member(), { id: "me", status: "active" }),
    ).toBe(true);
  });
  it("rejects inactive workspace members", () => {
    expect(
      canAssignTodoTo("owner", member({ role: "owner" }), {
        id: "other",
        status: "inactive",
      }),
    ).toBe(false);
  });
  it("allows administrators and explicit assignment grants", () => {
    expect(
      canAssignTodoTo("admin", member({ role: "admin" }), {
        id: "other",
        status: "active",
      }),
    ).toBe(true);
    expect(
      canAssignTodoTo(
        "me",
        member({ actionPermissions: { "todo.task.assign": true } }),
        { id: "other", status: "active" },
      ),
    ).toBe(true);
    expect(
      canAssignTodoTo(
        "me",
        member({ permissionOverrides: { "todo.assign": "allow" } }),
        { id: "any-active-member", status: "active" },
      ),
    ).toBe(true);
  });
  it("honors an explicit assignment restriction", () => {
    expect(
      canAssignTodoTo(
        "manager",
        member({
          role: "manager",
          departmentIds: ["sales"],
          permissionOverrides: { "todo.assign": "deny" },
        }),
        { id: "sales-user", status: "active", departmentIds: ["sales"] },
      ),
    ).toBe(false);
  });
  it("limits managers to their departments", () => {
    const manager = member({ role: "manager", departmentIds: ["sales"] });
    expect(
      canAssignTodoTo("manager", manager, {
        id: "sales-user",
        status: "active",
        departmentIds: ["sales"],
      }),
    ).toBe(true);
    expect(
      canAssignTodoTo("manager", manager, {
        id: "finance-user",
        status: "active",
        departmentIds: ["finance"],
      }),
    ).toBe(false);
  });
});
