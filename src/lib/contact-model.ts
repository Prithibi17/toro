import { z } from "zod";

const text = (max = 200) => z.string().trim().max(max).default("");
const id = z.string().trim().min(1).max(128);
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (value) =>
      value === "" ||
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value),
    "Enter a valid 15-character GSTIN",
  )
  .default("");
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
  website: z.string().trim().url().or(z.literal("")).default(""),
  industry: text(120),
  companySize: text(80),
  taxCountry: text(80),
  taxType: text(40),
  taxId: text(80),
  gstTreatment: z
    .enum([
      "",
      "registered",
      "unregistered",
      "consumer",
      "overseas",
      "special-economic-zone",
      "deemed-export",
    ])
    .default(""),
  gstin,
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
const updateShape = Object.fromEntries(
  Object.entries(contactInput.shape).map(([key, schema]) => [
    key,
    (schema instanceof z.ZodDefault
      ? schema.removeDefault()
      : schema
    ).optional(),
  ]),
) as {
  [K in keyof typeof contactInput.shape]: z.ZodOptional<
    (typeof contactInput.shape)[K] extends z.ZodDefault<infer Inner>
      ? Inner
      : (typeof contactInput.shape)[K]
  >;
};
export const contactUpdateInput = z
  .object(updateShape)
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
export const normalizeWebsite = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};
