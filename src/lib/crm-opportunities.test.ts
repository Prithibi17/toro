import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyAccess } from "./authorization";
const memory = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  sequence: 0,
}));
vi.mock("./firebase-admin", () => {
  const ref = (path: string) => ({
    path,
    id: path.split("/").at(-1)!,
    get: async () => snapshot(path),
  });
  const snapshot = (path: string) => ({
    id: path.split("/").at(-1)!,
    exists: memory.docs.has(path),
    data: () => memory.docs.get(path),
    ref: ref(path),
  });
  const db = {
    doc: ref,
    collection: (path: string) => ({
      doc: (id?: string) => ref(`${path}/${id ?? ++memory.sequence}`),
    }),
    runTransaction: async (callback: (tx: unknown) => Promise<void>) => {
      const writes: (() => void)[] = [];
      const tx = {
        get: async (r: { path: string }) => snapshot(r.path),
        create: (r: { path: string }, data: Record<string, unknown>) =>
          writes.push(() => {
            if (memory.docs.has(r.path)) throw new Error("Already exists");
            memory.docs.set(r.path, data);
          }),
        update: (r: { path: string }, data: Record<string, unknown>) =>
          writes.push(() =>
            memory.docs.set(r.path, { ...memory.docs.get(r.path), ...data }),
          ),
      };
      await callback(tx);
      writes.forEach((write) => write());
    },
  };
  return { getAdmin: () => ({ db }) };
});
vi.mock("./authorization", () => ({ authorizeCompany: vi.fn() }));
vi.mock("./audit", () => ({ appendAudit: vi.fn() }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "2026-10-04T00:00:00.000Z" },
}));
import { createOpportunity, updateOpportunity } from "./crm-opportunities";
import { crmReadable } from "./crm-server";
const root = "companies/a";
function access(role: "owner" | "employee" = "owner"): CompanyAccess {
  return {
    user: { uid: "me", name: "Test" },
    membership: {
      companyId: "a",
      companyName: "A",
      role,
      status: "active",
      enabledModules: ["crm"],
      permissions: {},
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
}
beforeEach(() => {
  memory.docs.clear();
  memory.sequence = 0;
  memory.docs.set(root, { currency: "USD" });
  memory.docs.set(`${root}/members/me`, { status: "active" });
  memory.docs.set(`${root}/crmPipelineStages/new`, {
    name: "New",
    stageType: "OPEN",
    active: true,
  });
  memory.docs.set(`${root}/crmPipelineStages/won`, {
    name: "Won",
    stageType: "WON",
    active: true,
  });
  memory.docs.set(`${root}/crmPipelineStages/lost`, {
    name: "Lost",
    stageType: "LOST",
    active: true,
  });
  memory.docs.set(`${root}/crmLostReasons/budget`, {
    name: "Budget",
    active: true,
  });
  memory.docs.set(`${root}/crmOpportunities/deal`, {
    name: "Deal",
    ownerId: "me",
    stageId: "new",
    status: "open",
    version: 1,
    priority: 1,
    probability: 17,
    email: "test@example.com",
    customerId: null,
    description: "Keep me",
  });
});
describe("CRM transactional mutations", () => {
  it("changes only explicitly supplied fields and increments the version", async () => {
    const result = await updateOpportunity("a", "deal", access(), {
      priority: 3,
      expectedVersion: 1,
    });
    expect(result).toMatchObject({
      priority: 3,
      probability: 17,
      email: "test@example.com",
      description: "Keep me",
      version: 2,
    });
  });
  it("rejects stale writes without changing the document", async () => {
    await expect(
      updateOpportunity("a", "deal", access(), {
        priority: 2,
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(memory.docs.get(`${root}/crmOpportunities/deal`)?.priority).toBe(1);
  });
  it("requires a lost reason and preserves probability when closing or reopening", async () => {
    await expect(
      updateOpportunity("a", "deal", access(), {
        stageId: "lost",
        expectedVersion: 1,
      }),
    ).rejects.toThrow("lost reason");
    const lost = await updateOpportunity("a", "deal", access(), {
      stageId: "lost",
      lostReasonId: "budget",
      expectedVersion: 1,
    });
    expect(lost).toMatchObject({ status: "lost", probability: 17 });
    const open = await updateOpportunity("a", "deal", access(), {
      stageId: "new",
      expectedVersion: 2,
    });
    expect(open).toMatchObject({
      status: "open",
      closedAt: null,
      probability: 17,
    });
  });
  it("lets employees edit their own records and denies access to another company", async () => {
    await expect(
      updateOpportunity("a", "deal", access("employee"), {
        priority: 2,
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({ priority: 2 });
    await expect(
      updateOpportunity("b", "deal", access(), {
        priority: 2,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("does not accept references that only exist in another company", async () => {
    memory.docs.set("companies/b/contacts/foreign", { name: "Private" });
    await expect(
      updateOpportunity("a", "deal", access(), {
        customerId: "foreign",
        expectedVersion: 1,
      }),
    ).rejects.toThrow("Invalid customerId");
  });
  it("uses the company currency and stable IDs for import retries", async () => {
    const args = { name: "Imported", stageId: "new", value: 50, priority: 0 };
    const one = await createOpportunity("a", access(), args, "import-test");
    const two = await createOpportunity("a", access(), args, "import-test");
    expect(one).toMatchObject({
      id: "import-test",
      currency: "USD",
      version: 1,
    });
    expect(two).toEqual(one);
  });
  it("honors field-level write and read restrictions", async () => {
    const user = access("employee");
    user.membership.crmPermissions = { opportunities: { edit: "own" } };
    user.effectivePermissions.fields = {
      "crm.opportunity": { name: { read: true, write: true } },
    };
    await expect(
      updateOpportunity("a", "deal", user, { priority: 2, expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    expect(crmReadable(user, { id: "deal", name: "Deal", value: 900 })).toEqual(
      { id: "deal", name: "Deal", version: 0 },
    );
  });
});
