import { describe, expect, it } from "vitest";
import {
  filterCrmRecords,
  getActivityState,
  normalizePriority,
  parseCrmQuery,
} from "./crm-query";
import { opportunityInput, opportunityUpdateInput } from "./crm-model";

describe("CRM record and query contracts", () => {
  it("does not populate omitted fields in partial updates", () => {
    expect(
      opportunityUpdateInput.parse({ priority: 2, expectedVersion: 1 }),
    ).toEqual({ priority: 2, expectedVersion: 1 });
  });
  it("keeps priority independent of probability", () => {
    const record = opportunityInput.parse({
      name: "Deal",
      stageId: "new",
      value: 10,
      priority: 3,
      probability: 12,
    });
    expect(record.priority).toBe(3);
    expect(record.probability).toBe(12);
    expect(normalizePriority("urgent")).toBe(3);
  });
  it("rejects invalid dates, priorities, paths and unknown update fields", () => {
    for (const fields of [
      { expectedCloseDate: "2026-02-30" },
      { expectedCloseDate: "2026-99-99" },
      { priority: 4 },
      { stageId: "other/company" },
      { createdBy: "other" },
    ]) {
      expect(opportunityUpdateInput.safeParse(fields).success).toBe(false);
    }
  });
  it("defines My Pipeline by salesperson, never creator", () => {
    const rows = [
      { id: "one", ownerId: "me", createdBy: "other" },
      { id: "two", ownerId: "other", createdBy: "me" },
      { id: "three", ownerId: null },
    ];
    expect(
      filterCrmRecords(rows, { mine: "true" }, "me").map((r) => r.id),
    ).toEqual(["one"]);
    expect(
      filterCrmRecords(rows, { unassigned: "true" }, "me").map((r) => r.id),
    ).toEqual(["three"]);
  });
  it("uses the company timezone for due-day boundaries", () => {
    const now = new Date("2026-10-03T20:00:00Z");
    expect(
      getActivityState({ dueAt: "2026-10-03T18:00:00Z" }, now, "Asia/Kolkata"),
    ).toBe("overdue");
    expect(
      getActivityState({ dueAt: "2026-10-03T19:00:00Z" }, now, "Asia/Kolkata"),
    ).toBe("today");
    expect(getActivityState({ dueAt: null }, now)).toBe("unscheduled");
    expect(getActivityState({ status: "completed", dueAt: null }, now)).toBe(
      "done",
    );
  });
  it("combines filters and sorts without mutating the source", () => {
    const rows = [
      { id: "a", name: "Alpha", value: 100, priority: 2 },
      { id: "b", name: "Beta", value: 10, priority: 3 },
      {
        id: "c",
        name: "Alpha archived",
        archived: true,
        value: 200,
        priority: 3,
      },
    ];
    expect(
      filterCrmRecords(
        rows,
        { priority: "2", sort: "value", direction: "asc" },
        "me",
      ).map((r) => r.id),
    ).toEqual(["b", "a"]);
    expect(
      filterCrmRecords(rows, { q: "ALPHA" }, "me").map((r) => r.id),
    ).toEqual(["a"]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(() => parseCrmQuery({ companyId: "foreign" })).toThrow();
  });
});
