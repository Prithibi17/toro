import { describe, expect, it } from "vitest";
import {
  canAccessConversation,
  canonicalDirectMessageId,
  messageMentions,
  isExactDirectMessage,
  canManageConversationMembers,
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
  it("keeps a two-person direct message private from every third user", () => {
    const directMessage = { type: "dm", memberIds: ["alice", "bob"] };
    expect(canAccessConversation("alice", member(), directMessage)).toBe(true);
    expect(canAccessConversation("bob", member(), directMessage)).toBe(true);
    expect(canAccessConversation("third", member(), directMessage)).toBe(false);
    expect(
      canAccessConversation("admin", member({ role: "admin" }), directMessage),
    ).toBe(false);
  });
  it("recognizes only an exact canonical two-member DM", () => {
    expect(
      isExactDirectMessage(
        { type: "dm", memberIds: ["bob", "alice"] },
        ["alice", "bob"],
      ),
    ).toBe(true);
    expect(
      isExactDirectMessage(
        { type: "dm", memberIds: ["alice", "bob", "third"] },
        ["alice", "bob"],
      ),
    ).toBe(false);
  });
  it("limits group membership management to owners and admins", () => {
    expect(canManageConversationMembers("owner", "group")).toBe(true);
    expect(canManageConversationMembers("admin", "private")).toBe(true);
    expect(canManageConversationMembers("manager", "group")).toBe(false);
    expect(canManageConversationMembers("admin", "dm")).toBe(false);
    expect(canManageConversationMembers("owner", "public")).toBe(false);
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
