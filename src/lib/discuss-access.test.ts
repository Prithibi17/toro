import { describe, expect, it } from "vitest";
import {
  canAccessConversation,
  canonicalDirectMessageId,
  messageMentions,
} from "./discuss-access";
import type { Membership } from "./types";

const member = (overrides: Partial<Membership> = {}): Membership => ({
  companyId: "a",
  companyName: "A",
  role: "employee",
  status: "active",
  enabledModules: ["discuss"],
  ...overrides,
});

describe("Discuss access", () => {
  it("reuses a canonical direct message regardless of participant order", () => {
    expect(canonicalDirectMessageId("b", "a")).toBe(
      canonicalDirectMessageId("a", "b"),
    );
  });
  it("does not grant admins implicit access to private conversations", () => {
    expect(
      canAccessConversation("admin", member({ role: "admin" }), {
        type: "private",
        memberIds: ["other"],
      }),
    ).toBe(false);
  });
  it("denies portal users and permits matching department members", () => {
    expect(
      canAccessConversation("u", member({ userType: "portal" }), {
        type: "public",
      }),
    ).toBe(false);
    expect(
      canAccessConversation("u", member({ departmentIds: ["sales"] }), {
        type: "department",
        departmentId: "sales",
      }),
    ).toBe(true);
  });
  it("extracts unique structured mentions", () => {
    expect(messageMentions("Hi @[Rahul](u1) and @[Rahul](u1)")).toEqual(["u1"]);
  });
});
