import { describe, expect, it } from "vitest";
import {
  basePermissionAllowed,
  simplePermissionAllowed,
} from "./permission-catalog";
import type { Membership } from "./types";

function membership(
  role: Membership["role"],
  overrides: Membership["permissionOverrides"] = {},
): Membership {
  return {
    companyId: "company",
    companyName: "Toro",
    role,
    status: "active",
    enabledModules: ["crm", "contacts", "sales", "todo"],
    appAccess: { crm: "user", contacts: "user", sales: "user", todo: "user" },
    permissionOverrides: overrides,
  };
}

describe("simple permission experience", () => {
  it("gives employees productive defaults without administration", () => {
    expect(basePermissionAllowed("employee", "contacts.create")).toBe(true);
    expect(basePermissionAllowed("employee", "sales.quotation.create")).toBe(
      true,
    );
    expect(basePermissionAllowed("employee", "employees.manage")).toBe(false);
  });

  it("allows a company-view exception without changing role", () => {
    const employee = membership("employee", {
      "crm.opportunity.company_view": "allow",
    });
    expect(
      simplePermissionAllowed(employee, "crm.opportunity.company_view", "crm"),
    ).toBe(true);
    expect(employee.role).toBe("employee");
  });

  it("makes CANNOT override role defaults", () => {
    const admin = membership("admin", {
      "crm.opportunity.delete": "deny",
    });
    expect(
      simplePermissionAllowed(admin, "crm.opportunity.delete", "crm"),
    ).toBe(false);
  });

  it("makes app OFF override custom access", () => {
    const employee = membership("employee", {
      "crm.opportunity.company_view": "allow",
    });
    employee.appAccess = { crm: "none" };
    expect(
      simplePermissionAllowed(employee, "crm.opportunity.company_view", "crm"),
    ).toBe(false);
  });

  it("keeps the owner unrestricted", () => {
    const owner = membership("owner", {
      "crm.opportunity.delete": "deny",
    });
    expect(
      simplePermissionAllowed(owner, "crm.opportunity.delete", "crm"),
    ).toBe(true);
  });
});
