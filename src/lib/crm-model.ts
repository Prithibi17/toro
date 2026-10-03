import { z } from "zod";
import type { CrmSection } from "./types";
export const CRM_COLLECTIONS = {
  leads: "crmLeads",
  contacts: "crmContacts",
  organizations: "crmOrganizations",
  opportunities: "crmOpportunities",
  pipelines: "crmPipelines",
  stages: "crmPipelineStages",
  activities: "crmActivities",
  timeline: "crmTimeline",
  notes: "crmNotes",
  customFields: "crmCustomFields",
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
const id = z.string().trim().min(1).max(128);
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
  contactId: id.nullable().default(null),
  organizationId: id.nullable().default(null),
  pipelineId: id,
  stageId: id,
  ownerId: id.optional(),
  departmentIds: z.array(id).max(20).default([]),
  value: z.coerce.number().min(0).max(999999999),
  currency: z.string().length(3).default("INR"),
  probability: z.coerce.number().min(0).max(100).default(0),
  expectedCloseDate: text(30),
  source: text(80),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
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
  type: z.enum(["call", "meeting", "email", "follow-up", "task", "other"]),
  title: z.string().trim().min(2).max(200),
  description: text(2000),
  relatedType: z.enum(["lead", "contact", "organization", "opportunity"]),
  relatedId: id,
  ownerId: id.optional(),
  assigneeId: id.optional(),
  departmentIds: z.array(id).max(20).default([]),
  dueAt: z.string().datetime().nullable().default(null),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["scheduled", "completed", "cancelled"]).default("scheduled"),
  outcome: text(1000),
});
export const sectionInputs = {
  leads: leadInput,
  contacts: contactInput,
  organizations: organizationInput,
  opportunities: opportunityInput,
  activities: activityInput,
  pipelines: pipelineInput,
} as const;
export type CrmEntitySection = keyof typeof sectionInputs;
