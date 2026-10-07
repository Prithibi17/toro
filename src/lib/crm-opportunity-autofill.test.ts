import { describe, expect, it } from "vitest";
import {
  autofillOpportunityFromContact,
  blankOpportunityDraft,
} from "./crm-opportunity-autofill";

describe("CRM opportunity contact autofill", () => {
  it("fills only facts stored on the selected contact", () => {
    expect(
      autofillOpportunityFromContact(
        blankOpportunityDraft("current-user"),
        {
          id: "contact-1",
          displayName: "Acme Limited",
          email: "sales@acme.test",
          phone: "",
          mobile: "+91 99999 99999",
        },
      ),
    ).toEqual({
      name: "",
      customerId: "contact-1",
      ownerId: "current-user",
      value: "0",
      email: "sales@acme.test",
      phone: "+91 99999 99999",
    });
  });

  it("does not guess the opportunity name, revenue, or salesperson", () => {
    const current = {
      ...blankOpportunityDraft("current-user"),
      name: "Five office chairs",
      value: "2500",
    };
    expect(
      autofillOpportunityFromContact(
        current,
        { id: "contact-2", name: "Mira" },
      ),
    ).toMatchObject({
      name: "Five office chairs",
      ownerId: "current-user",
      value: "2500",
    });
  });
});
