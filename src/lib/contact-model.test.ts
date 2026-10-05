import { describe, expect, it } from "vitest";
import {
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
  contactInput,
  contactUpdateInput,
} from "./contact-model";
describe("contact identity normalization", () => {
  it("normalizes case-insensitive email", () =>
    expect(normalizeEmail(" JOHN@ABC.COM ")).toBe("john@abc.com"));
  it("normalizes phone formatting", () =>
    expect(normalizePhone("+91 98006 12345")).toBe("9800612345"));
  it("extracts a comparable website domain", () =>
    expect(normalizeDomain("https://www.abc.com/about")).toBe("abc.com"));
  it("creates a contact with only its name and type", () => {
    const contact = contactInput.parse({
      contactType: "company",
      displayName: "ABC Technologies",
    });
    expect(contact.email).toBe("");
    expect(contact.phone).toBe("");
    expect(contact.gstin).toBe("");
  });
  it("validates optional fields only when supplied", () => {
    expect(
      contactInput.safeParse({
        contactType: "person",
        displayName: "Rahul Sharma",
        email: "bad",
      }).success,
    ).toBe(false);
    expect(
      contactInput.safeParse({
        contactType: "company",
        displayName: "ABC",
        gstin: "bad",
      }).success,
    ).toBe(false);
    expect(normalizeWebsite("example.com")).toBe("https://example.com");
  });
  it("does not add creation defaults to partial updates", () => {
    expect(contactUpdateInput.parse({ notes: "Remember this" })).toEqual({
      notes: "Remember this",
    });
  });
});
