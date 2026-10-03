import { z } from "zod";

export const CRM_COLLECTIONS = {
  leads: "crmLeads", contacts: "crmContacts", organizations: "crmOrganizations",
  opportunities: "crmOpportunities", pipelines: "crmPipelines", stages: "crmPipelineStages", activities: "crmActivities",
} as const;

const id = z.string().trim().min(1).max(128);
const ownedRecord = { ownerId: id, createdBy: id, updatedBy: id.optional() };
export const leadSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.string().email().or(z.literal("")), phone: z.string().max(40).default(""), organizationName: z.string().max(160).default(""), status: z.enum(["new", "working", "qualified", "converted", "lost"]), ...ownedRecord });
export const contactSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().max(80).default(""), email: z.string().email().or(z.literal("")), phone: z.string().max(40).default(""), organizationId: id.nullable().default(null), ...ownedRecord });
export const organizationSchema = z.object({ name: z.string().trim().min(2).max(160), website: z.string().url().or(z.literal("")), industry: z.string().max(100).default(""), ownerId: id, createdBy: id, updatedBy: id.optional() });
export const opportunitySchema = z.object({ name: z.string().trim().min(2).max(160), pipelineId: id, stageId: id, contactId: id.nullable().default(null), organizationId: id.nullable().default(null), ownerId: id, value: z.coerce.number().min(0).max(999999999), status: z.enum(["open", "won", "lost"]), createdBy: id, updatedBy: id.optional() });
export const pipelineSchema = z.object({ name: z.string().trim().min(2).max(100), isDefault: z.boolean().default(false), active: z.boolean().default(true) });
export const pipelineStageSchema = z.object({ pipelineId: id, name: z.string().trim().min(1).max(100), order: z.number().int().min(0), probability: z.number().min(0).max(100).default(0), terminalState: z.enum(["none", "won", "lost"]).default("none") });
export const activitySchema = z.object({ subject: z.string().trim().min(2).max(200), type: z.enum(["task", "call", "meeting", "email", "note"]), relatedType: z.enum(["lead", "contact", "organization", "opportunity"]), relatedId: id, ownerId: id, assigneeId: id.nullable().default(null), dueAt: z.string().datetime().nullable().default(null), completed: z.boolean().default(false), createdBy: id, updatedBy: id.optional() });

export type Lead = z.infer<typeof leadSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type Pipeline = z.infer<typeof pipelineSchema>;
export type PipelineStage = z.infer<typeof pipelineStageSchema>;
export type Activity = z.infer<typeof activitySchema>;
