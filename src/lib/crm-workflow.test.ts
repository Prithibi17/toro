import { describe, expect, it } from "vitest";
import {
  crmEntityType,
  linkedModule,
  opportunityStatus,
  relatedCollection,
} from "./crm-workflow";

describe("CRM workflow invariants", () => {
  it("derives opportunity state from semantic stage type", () => {
    expect(opportunityStatus("OPEN")).toBe("open");
    expect(opportunityStatus("WON")).toBe("won");
    expect(opportunityStatus("LOST")).toBe("lost");
  });
  it("maps relationships only to canonical CRM collections", () => {
    expect(relatedCollection("contact")).toBe("crmContacts");
    expect(relatedCollection("unknown")).toBeUndefined();
  });
  it("routes scheduled work to its operational module", () => {
    expect(linkedModule("meeting")).toBe("calendar");
    expect(linkedModule("follow-up")).toBe("todo");
    expect(linkedModule("email")).toBeNull();
  });
  it("uses stable singular entity names for timeline events", () => {
    expect(crmEntityType("activities")).toBe("activity");
    expect(crmEntityType("opportunities")).toBe("opportunity");
  });
});
