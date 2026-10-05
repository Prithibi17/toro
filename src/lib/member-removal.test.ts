import { describe, expect, it } from "vitest";
import type { Membership } from "./types";
import { memberRemovalError } from "./member-removal";

const actor = (role: string) => ({ role, status: "active" }) as Membership;
describe("workspace member removal safeguards", () => {
  it("never permits ordinary owner removal", () =>
    expect(
      memberRemovalError(
        "admin",
        actor("admin"),
        { id: "owner", role: "owner", status: "active" },
        2,
      ),
    ).toContain("Transfer ownership"));
  it("prevents non-owners from removing administrators", () =>
    expect(
      memberRemovalError(
        "manager",
        actor("manager"),
        { id: "admin", role: "admin", status: "active" },
        2,
      ),
    ).toContain("Only the workspace owner"));
  it("protects the final administrator from self-removal", () =>
    expect(
      memberRemovalError(
        "admin",
        actor("admin"),
        { id: "admin", role: "admin", status: "active" },
        1,
      ),
    ).toContain("last workspace administrator"));
  it("allows an authorized actor to remove an active employee", () =>
    expect(
      memberRemovalError(
        "admin",
        actor("admin"),
        { id: "employee", role: "employee", status: "active" },
        1,
      ),
    ).toBeNull());
});
