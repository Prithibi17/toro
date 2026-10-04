import { z } from "zod";
import type { CrmSection } from "./types";
export const CRM_COLLECTIONS = {
  leads: "crmLeads",
  contacts: "crmContacts",
  organizations: "crmOrganizations",
  opportunities: "crmOpportunities",
  pipelines: "crmPipelines",
  stages: "crmPipelineStages",
  stageHistory: "crmStageHistory",
  activities: "crmActivities",
  timeline: "crmTimeline",
  notes: "crmNotes",
  customFields: "crmCustomFields",
  associations: "crmAssociations",
} as const;
export const CRM_SECTIONS: CrmSection[] = [
  "overview",
  "leads",
  "contacts",
  "organizations",
  "opportunities",
  "activities",
  "pipelines",
];
const text = (max = 200) => z.string().trim().max(max).default("");
const id = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[^/]+$/, "Invalid record ID");
export const priorityInput = z.union([
  z.number().int().min(0).max(3),
  z
    .enum(["low", "medium", "high", "urgent"])
    .transform((v) => ["low", "medium", "high", "urgent"].indexOf(v)),
]);
const dateOnly = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(new Date(v).getTime()) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "Invalid date",
  );
const custom = z
  .record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  )
  .default({});
const common = {
  ownerId: id.optional(),
  departmentIds: z.array(id).max(20).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  description: text(4000),
  customFields: custom,
};
export const leadInput = z.object({
  name: z.string().trim().min(2).max(160),
  organizationName: text(160),
  email: z.string().email().or(z.literal("")),
  phone: text(40),
  source: text(80),
  status: text(80).default("New"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  estimatedValue: z.coerce.number().min(0).max(999999999).default(0),
  ...common,
});
export const contactInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: text(80),
  email: z.string().email().or(z.literal("")),
  phone: text(40),
  alternativePhone: text(40),
  jobTitle: text(120),
  organizationId: id.nullable().default(null),
  source: text(80),
  address: text(500),
  notes: text(4000),
  ...common,
});
export const organizationInput = z.object({
  name: z.string().trim().min(2).max(160),
  industry: text(100),
  website: z.string().url().or(z.literal("")),
  email: z.string().email().or(z.literal("")),
  phone: text(40),
  address: text(500),
  ...common,
});
export const opportunityInput = z.object({
  name: z.string().trim().min(2).max(160),
  customerId: id.nullable().default(null),
  primaryContactId: id.nullable().default(null),
  contactId: id.nullable().default(null),
  organizationId: id.nullable().default(null),
  pipelineId: id.nullable().default(null),
  stageId: id,
  ownerId: id.nullable().optional(),
  salesTeamId: id.nullable().default(null),
  email: z.string().email().or(z.literal("")).default(""),
  phone: text(40),
  city: text(100),
  country: text(100),
  medium: text(100),
  campaign: text(100),
  lostReasonId: id.nullable().default(null),
  lostNotes: text(2000),
  departmentIds: z.array(id).max(20).default([]),
  value: z.coerce.number().min(0).max(999999999),
  currency: z.string().length(3).default("INR"),
  probability: z.coerce.number().min(0).max(100).default(0),
  expectedCloseDate: dateOnly.default(""),
  source: text(80),
  priority: priorityInput.default(0),
  tags: z.array(z.string()).max(30).default([]),
  description: text(4000),
  customFields: custom,
});
export const opportunitySchema = opportunityInput.extend({
  createdBy: id,
  updatedBy: id.optional(),
  status: z.enum(["open", "won", "lost"]).default("open"),
});
export const pipelineInput = z.object({
  name: z.string().trim().min(2).max(100),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        stageType: z.enum(["OPEN", "WON", "LOST"]),
        probability: z.coerce.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(30),
});
export const activityInput = z.object({
  type: z.enum([
    "call",
    "meeting",
    "email",
    "follow-up",
    "task",
    "document",
    "other",
  ]),
  title: z.string().trim().min(2).max(200),
  description: text(2000),
  relatedType: z.enum([
    "lead",
    "contact",
    "organization",
    "opportunity",
    "task",
  ]),
  relatedId: id,
  ownerId: id.optional(),
  assigneeId: id.optional(),
  departmentIds: z.array(id).max(20).default([]),
  dueAt: z.string().datetime().nullable().default(null),
  endAt: z.string().datetime().optional(),
  attendeeIds: z.array(id).max(100).default([]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["scheduled", "completed", "cancelled"]).default("scheduled"),
  outcome: text(1000),
});
export const leadConversionInput = z.object({
  contactId: id.nullable().default(null),
  organizationId: id.nullable().default(null),
  createContact: z.boolean().default(true),
  createOrganization: z.boolean().default(true),
  createOpportunity: z.boolean().default(true),
  opportunityTitle: text(160),
  stageId: id.nullable().default(null),
});
// Zod 4 applies defaults even inside optional fields. A PATCH must never
// replace omitted fields with creation defaults (for example, clear a customer).
const updateShape = Object.fromEntries(
  Object.entries(opportunityInput.shape).map(([key, schema]) => [
    key,
    (schema instanceof z.ZodDefault
      ? schema.removeDefault()
      : schema
    ).optional(),
  ]),
) as {
  [K in keyof typeof opportunityInput.shape]: z.ZodOptional<
    (typeof opportunityInput.shape)[K] extends z.ZodDefault<infer Inner>
      ? Inner
      : (typeof opportunityInput.shape)[K]
  >;
};
export const opportunityUpdateInput = z
  .object(updateShape)
  .extend({
    expectedVersion: z.number().int().min(0).optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export const sectionInputs = {
  leads: leadInput,
  contacts: contactInput,
  organizations: organizationInput,
  opportunities: opportunityInput,
  activities: activityInput,
  pipelines: pipelineInput,
} as const;
export type CrmEntitySection = keyof typeof sectionInputs;
