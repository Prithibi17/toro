import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyAccess } from "./authorization";
const memory = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  access: null as CompanyAccess | null,
}));
vi.mock("./authorization", () => ({
  authorizeCompany: async () => ({ ok: true, access: memory.access }),
}));
vi.mock("./crm-defaults", () => ({ ensureDefaultCrmStages: vi.fn() }));
vi.mock("./firebase-admin", () => {
  const snapshot = (path: string, data: Record<string, unknown>) => ({
    id: path.split("/").at(-1)!,
    exists: true,
    data: () => data,
  });
  function collection(
    path: string,
    predicates: ((data: Record<string, unknown>) => boolean)[] = [],
    cap = Infinity,
    after = "",
  ) {
    return {
      where: (field: string, _op: string, value: unknown) =>
        collection(
          path,
          [...predicates, (data) => data[field] === value],
          cap,
          after,
        ),
      orderBy: () => collection(path, predicates, cap, after),
      limit: (count: number) => collection(path, predicates, count, after),
      startAfter: (id: string) => collection(path, predicates, cap, id),
      get: async () => {
        const docs = [...memory.documents]
          .filter(
            ([key, data]) =>
              key.startsWith(path + "/") &&
              !key.slice(path.length + 1).includes("/") &&
              key.slice(path.length + 1) > after &&
              predicates.every((test) => test(data)),
          )
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, cap)
          .map(([key, data]) => snapshot(key, data));
        return { docs, size: docs.length, empty: !docs.length };
      },
    };
  }
  return {
    getAdmin: () => ({
      db: {
        collection,
        doc: (path: string) => ({
          get: async () => snapshot(path, memory.documents.get(path) ?? {}),
        }),
      },
    }),
  };
});
import { crmList } from "./crm-list";
beforeEach(() => {
  memory.documents.clear();
  memory.access = {
    user: { uid: "me" },
    membership: {
      companyId: "a",
      companyName: "A",
      status: "active",
      role: "owner",
      enabledModules: ["crm"],
    },
    effectivePermissions: {
      roleIds: [],
      appAccess: {},
      resources: {},
      actions: {},
      fields: {},
      legacyPermissions: {},
      approvalLimits: {},
    },
  };
  memory.documents.set("companies/a", { currency: "USD", timezone: "UTC" });
});
describe("CRM paged lists", () => {
  it("reaches older records without overlap or silently dropping the last page", async () => {
    for (let n = 0; n < 1002; n++)
      memory.documents.set(
        `companies/a/crmOpportunities/${String(n).padStart(4, "0")}`,
        { name: `Deal ${n}`, ownerId: "me", priority: 0 },
      );
    const first = await crmList("a");
    expect(first.records).toHaveLength(1000);
    expect(first.nextCursor).toBe("0999");
    const second = await crmList("a", {}, first.nextCursor!);
    expect(second.records.map((record) => record.id).sort()).toEqual([
      "1000",
      "1001",
    ]);
    expect(second.nextCursor).toBeNull();
  });
  it("returns a cursor even when the first page has no filter matches", async () => {
    for (let n = 0; n < 1001; n++)
      memory.documents.set(
        `companies/a/crmOpportunities/${String(n).padStart(4, "0")}`,
        { name: n === 1000 ? "Target" : "Other", ownerId: "me" },
      );
    const first = await crmList("a", { q: "Target" });
    expect(first.records).toHaveLength(0);
    expect(first.nextCursor).not.toBeNull();
    expect(
      (await crmList("a", { q: "Target" }, first.nextCursor!)).records[0].name,
    ).toBe("Target");
  });
  it("applies own scope before pagination and never returns another company", async () => {
    memory.access!.membership.role = "employee";
    memory.documents.set("companies/a/crmOpportunities/one", {
      ownerId: "other",
      name: "Private",
    });
    memory.documents.set("companies/a/crmOpportunities/two", {
      ownerId: "me",
      name: "Mine",
    });
    memory.documents.set("companies/b/crmOpportunities/three", {
      ownerId: "me",
      name: "Other company",
    });
    expect((await crmList("a")).records.map((record) => record.id)).toEqual([
      "two",
    ]);
    await expect(crmList("a", {}, "other/company")).rejects.toThrow("cursor");
  });
});
