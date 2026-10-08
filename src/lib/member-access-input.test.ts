import { describe, expect, it } from "vitest";
import { memberAccessUpdateInput } from "./member-access-input";

describe("member access update input", () => {
  it("accepts only the apps enabled for the workspace", () => {
    const result = memberAccessUpdateInput.parse({
      userId: "member-1",
      role: "admin",
      departmentIds: ["department-1"],
      appAccess: {
        discuss: "user",
        calendar: "user",
        todo: "user",
        crm: "user",
      },
      permissionOverrides: {
        "tasks.view_all": "allow",
      },
    });

    expect(result.appAccess).toEqual({
      discuss: "user",
      calendar: "user",
      todo: "user",
      crm: "user",
    });
  });

  it("rejects unknown app keys", () => {
    expect(() =>
      memberAccessUpdateInput.parse({
        userId: "member-1",
        appAccess: { unknown: "user" },
      }),
    ).toThrow();
  });
});
