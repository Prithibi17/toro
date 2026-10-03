import { describe, expect, it } from "vitest";
import {
  accessExpired,
  appAllowed,
  effectivePermissions,
  filterReadableFields,
  rejectUnwritableFields,
  resolveRoleGraph,
} from "./permission-engine";
import type { Membership, RoleDefinition } from "./types";

const membership = (overrides: Partial<Membership> = {}): Membership => ({
  companyId: "company-a",
  companyName: "Company A",
  role: "employee",
  status: "active",
  enabledModules: ["crm", "todo"],
  ...overrides,
});

describe("enterprise permission engine", () => {
  it("resolves inherited roles and merges grants without weakening scope", () => {
    const roles: RoleDefinition[] = [
      {
        id: "sales-user",
        name: "Sales User",
        appAccess: { crm: "user" },
        resources: { "crm.opportunity": { read: true, scope: "own" } },
      },
      {
        id: "sales-manager",
        name: "Sales Manager",
        inheritedRoleIds: ["sales-user"],
        resources: {
          "crm.opportunity": { write: true, scope: "department" },
        },
      },
    ];
    const result = effectivePermissions(
      membership({ roleIds: ["sales-manager"] }),
      roles,
    );
    expect(result.roleIds).toEqual(["sales-user", "sales-manager"]);
    expect(result.appAccess.crm).toBe("user");
    expect(result.resources["crm.opportunity"]).toEqual({
      read: true,
      write: true,
      scope: "department",
    });
  });

  it("rejects direct and transitive inheritance cycles", () => {
    expect(() =>
      resolveRoleGraph(
        ["a"],
        [
          { id: "a", name: "A", inheritedRoleIds: ["b"] },
          { id: "b", name: "B", inheritedRoleIds: ["a"] },
        ],
      ),
    ).toThrow("cycle");
  });

  it("denies portal users internal apps and expired memberships", () => {
    const portal = membership({ userType: "portal" });
    expect(appAllowed(portal, effectivePermissions(portal), "crm")).toBe(false);
    expect(
      accessExpired(
        membership({ accessExpiresAt: "2025-01-01T00:00:00.000Z" }),
        new Date("2025-01-02T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("applies explicit membership denials after inherited role grants", () => {
    const role: RoleDefinition = {
      id: "crm-user",
      name: "CRM User",
      appAccess: { crm: "user" },
      actions: { "crm.export": true },
    };
    const member = membership({
      roleIds: [role.id],
      appAccess: { crm: "none" },
      actionPermissions: { "crm.export": false },
    });
    const result = effectivePermissions(member, [role]);
    expect(appAllowed(member, result, "crm")).toBe(false);
    expect(result.actions["crm.export"]).toBe(false);
  });

  it("removes unreadable fields and rejects unauthorized writes", () => {
    const effective = effectivePermissions(
      membership({
        fieldPermissions: {
          "crm.opportunity": {
            name: { read: true, write: true },
            margin: { read: false, write: false },
          },
        },
      }),
    );
    expect(
      filterReadableFields(effective, "crm.opportunity", {
        name: "Deal",
        margin: 42,
      }),
    ).toEqual({ name: "Deal" });
    expect(
      rejectUnwritableFields(effective, "crm.opportunity", ["name", "margin"]),
    ).toEqual(["margin"]);
  });
});
