import { describe, expect, it } from "vitest";
import {
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "./contact-model";
describe("contact identity normalization", () => {
  it("normalizes case-insensitive email", () =>
    expect(normalizeEmail(" JOHN@ABC.COM ")).toBe("john@abc.com"));
  it("normalizes phone formatting", () =>
    expect(normalizePhone("+91 98006 12345")).toBe("9800612345"));
  it("extracts a comparable website domain", () =>
    expect(normalizeDomain("https://www.abc.com/about")).toBe("abc.com"));
});
