import { describe, expect, it } from "vitest";
import {
  canReadTask,
  crmGrant,
  crmRecordAllowed,
  hasPermission,
} from "./access-policy";
import type { Membership } from "./types";
const member = (
  role: Membership["role"],
  permissions: Membership["permissions"] = {},
  departmentIds: string[] = [],
): Membership => ({
  companyId: "a",
  companyName: "A",
  role,
  status: "active",
  enabledModules: ["todo", "crm"],
  permissions,
  departmentIds,
});
describe("permission policy", () => {
  it("gives owners every declared permission", () =>
    expect(hasPermission(member("owner"), "crm.manage")).toBe(true));
  it("does not leak permissions between membership objects", () => {
    expect(
      hasPermission(member("employee", { "crm.manage": true }), "crm.manage"),
    ).toBe(true);
    expect(hasPermission(member("employee"), "crm.manage")).toBe(false);
  });
});
describe("task visibility", () => {
  it("allows owner and admin company visibility", () => {
    expect(canReadTask("x", member("owner"), {})).toBe(true);
    expect(canReadTask("x", member("admin"), {})).toBe(true);
  });
  it("allows creator, assignee and explicit viewer", () => {
    const m = member("employee");
    expect(canReadTask("u", m, { creatorId: "u" })).toBe(true);
    expect(canReadTask("u", m, { assigneeIds: ["u"] })).toBe(true);
    expect(canReadTask("u", m, { viewerIds: ["u"] })).toBe(true);
  });
  it("denies unrelated employee and allows manager department scope", () => {
    expect(
      canReadTask("u", member("employee", {}, ["sales"]), {
        departmentIds: ["sales"],
      }),
    ).toBe(false);
    expect(
      canReadTask("u", member("manager", {}, ["sales"]), {
        departmentIds: ["sales"],
      }),
    ).toBe(true);
    expect(
      canReadTask("u", member("manager", {}, ["sales"]), {
        departmentIds: ["finance"],
      }),
    ).toBe(false);
  });
});
describe("CRM permission resolution", () => {
  it("limits team visibility to server-resolved active teams", () => {
    const m = member("employee");
    m.resourcePermissions = {
      "crm.opportunity": { read: true, scope: "team" },
    };
    m.crmTeamIds = ["sales-east"];
    expect(crmGrant(m, "opportunities", "view")).toBe("team");
    expect(
      crmRecordAllowed("me", m, "team", {
        ownerId: "other",
        salesTeamId: "sales-east",
      }),
    ).toBe(true);
    expect(
      crmRecordAllowed("me", m, "team", {
        ownerId: "me",
        salesTeamId: "sales-west",
      }),
    ).toBe(false);
    expect(crmRecordAllowed("me", m, "team", { ownerId: "me" })).toBe(false);
  });
  it("does not fall back to role access after an explicit resource denial", () => {
    const m = member("admin");
    m.resourcePermissions = {
      "crm.opportunity": { read: false, write: false, create: false },
    };
    expect(crmGrant(m, "opportunities", "view")).toBe(false);
    expect(crmGrant(m, "opportunities", "edit")).toBe(false);
    expect(crmGrant(m, "opportunities", "create")).toBe(false);
  });
  it("resolves singular opportunity and activity resource names", () => {
    const m = member("employee");
    m.resourcePermissions = {
      "crm.opportunity": { read: true, write: true, scope: "company" },
      "crm.activity": { create: true },
    };
    expect(crmGrant(m, "opportunities", "view")).toBe("all");
    expect(crmGrant(m, "opportunities", "edit")).toBe("all");
    expect(crmGrant(m, "activities", "create")).toBe(true);
  });
  it("applies an individual override before role fallback", () => {
    const m = member("employee");
    m.crmPermissions = { leads: { view: "all", create: false } };
    expect(crmGrant(m, "leads", "view")).toBe("all");
    expect(crmGrant(m, "leads", "create")).toBe(false);
  });
  it("defaults owners to full authority and employees to own reads", () => {
    expect(crmGrant(member("owner"), "opportunities", "edit")).toBe("all");
    expect(crmGrant(member("employee"), "opportunities", "view")).toBe("own");
  });
  it("enforces own and department scopes", () => {
    const m = member("manager", {}, ["sales"]);
    expect(crmRecordAllowed("u", m, "own", { ownerId: "u" })).toBe(true);
    expect(crmRecordAllowed("u", m, "own", { ownerId: "x" })).toBe(false);
    expect(
      crmRecordAllowed("u", m, "department", { departmentIds: ["sales"] }),
    ).toBe(true);
    expect(
      crmRecordAllowed("u", m, "department", { departmentIds: ["finance"] }),
    ).toBe(false);
  });
});
