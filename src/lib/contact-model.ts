import { z } from "zod";

const text = (max = 200) => z.string().trim().max(max).default("");
const id = z.string().trim().min(1).max(128);
export const addressInput = z.object({
  type: z
    .enum([
      "main",
      "registered",
      "billing",
      "shipping",
      "office",
      "warehouse",
      "branch",
      "other",
    ])
    .default("main"),
  label: text(80),
  street: text(200),
  street2: text(200),
  city: text(100),
  state: text(100),
  postalCode: text(30),
  country: text(100),
  phone: text(40),
});
export const contactInput = z.object({
  contactType: z.enum(["person", "company"]),
  displayName: z.string().trim().min(2).max(160),
  legalName: text(200),
  firstName: text(80),
  middleName: text(80),
  lastName: text(80),
  parentContactId: id.nullable().default(null),
  jobTitle: text(120),
  department: text(120),
  email: z.string().email().or(z.literal("")).default(""),
  alternativeEmail: z.string().email().or(z.literal("")).default(""),
  phone: text(40),
  mobile: text(40),
  website: text(240),
  industry: text(120),
  companySize: text(80),
  taxCountry: text(80),
  taxType: text(40),
  taxId: text(80),
  registrationNumber: text(100),
  customerStatus: z
    .enum(["prospect", "active", "inactive", "former"])
    .default("prospect"),
  isCustomer: z.boolean().default(false),
  isVendor: z.boolean().default(false),
  isPartner: z.boolean().default(false),
  ownerId: id.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  notes: text(4000),
  address: addressInput.optional(),
});
export const contactUpdateInput = contactInput
  .partial()
  .extend({ archived: z.boolean().optional() });
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const normalizePhone = (value: string) =>
  value.replace(/\D/g, "").slice(-10);
export const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
