import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as null | { uid: string },
  documents: new Map<string, unknown>(),
}));
vi.mock("./session", () => ({ currentUser: vi.fn(async () => state.user) }));
vi.mock("./firebase-admin", () => ({
  getAdmin: () => ({
    db: {
      doc: (path: string) => ({
        get: async () => ({
          exists: state.documents.has(path),
          data: () => state.documents.get(path),
        }),
      }),
      collection: (path: string) => ({
        where: (field: string, op: string, value: string) => ({
          get: async () => ({
            docs: [...state.documents]
              .filter(([key, raw]) => {
                const data = raw as Record<string, unknown>;
                return (
                  key.startsWith(path + "/") &&
                  !key.slice(path.length + 1).includes("/") &&
                  op === "array-contains" &&
                  Array.isArray(data[field]) &&
                  data[field].includes(value)
                );
              })
              .map(([key, data]) => ({
                id: key.split("/").at(-1),
                data: () => data,
              })),
          }),
        }),
      }),
    },
  }),
}));
import { authorizeCompany } from "./authorization";
const membership = {
  companyId: "a",
  companyName: "A",
  role: "employee",
  status: "active",
  enabledModules: ["crm"],
  permissions: { "crm.manage": true },
};
describe("CRM team authorization", () => {
  it("resolves only active teams from this company and ignores stored derived IDs", async () => {
    state.documents.clear();
    state.user = { uid: "u" };
    state.documents.set("companies/a/members/u", {
      ...membership,
      crmTeamIds: ["forged"],
      resourcePermissions: { "crm.opportunity": { read: true, scope: "team" } },
    });
    state.documents.set("companies/a/crmSalesTeams/east", {
      active: true,
      memberIds: ["u"],
    });
    state.documents.set("companies/a/crmSalesTeams/inactive", {
      active: false,
      memberIds: ["u"],
    });
    state.documents.set("companies/a/crmSalesTeams/other", {
      active: true,
      memberIds: ["other"],
    });
    state.documents.set("companies/b/crmSalesTeams/foreign", {
      active: true,
      memberIds: ["u"],
    });
    const result = await authorizeCompany("a", { module: "crm" });
    expect(result.ok && result.access.membership.crmTeamIds).toEqual(["east"]);
    state.documents.set("companies/a/crmSalesTeams/east", {
      active: true,
      memberIds: [],
    });
    const revoked = await authorizeCompany("a", { module: "crm" });
    expect(revoked.ok && revoked.access.membership.crmTeamIds).toEqual([]);
  });
});
describe("company authorization", () => {
  beforeEach(() => {
    state.user = null;
    state.documents.clear();
  });
  it("returns unauthenticated without a session", async () =>
    expect(await authorizeCompany("a")).toEqual({
      ok: false,
      reason: "unauthenticated",
    }));
  it("does not grant Company A membership to Company B", async () => {
    state.user = { uid: "u" };
    state.documents.set("companies/a/members/u", membership);
    expect((await authorizeCompany("a")).ok).toBe(true);
    expect(await authorizeCompany("b")).toEqual({
      ok: false,
      reason: "not_member",
    });
  });
  it("requires enabled modules and permissions", async () => {
    state.user = { uid: "u" };
    state.documents.set("companies/a/members/u", membership);
    expect(
      (await authorizeCompany("a", { module: "crm", permission: "crm.manage" }))
        .ok,
    ).toBe(true);
    expect(await authorizeCompany("a", { module: "todo" })).toEqual({
      ok: false,
      reason: "module_disabled",
    });
    expect(
      await authorizeCompany("a", {
        module: "crm",
        permission: "tasks.assign",
      }),
    ).toEqual({ ok: false, reason: "permission_denied" });
  });
});
