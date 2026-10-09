import { describe, expect, it } from "vitest";
import { memberRoleLabel } from "./member-role";

describe("member role labels", () => {
  it("identifies interns as employees", () => {
    expect(memberRoleLabel("intern")).toBe("Employee (Intern)");
  });

  it("keeps the standard employee label", () => {
    expect(memberRoleLabel("employee")).toBe("Employee");
  });
});
