import { z } from "zod";
import { MODULES } from "./types";

const accessLevel = z.enum([
  "none",
  "user",
  "manager",
  "administrator",
  "custom",
]);
const scope = z.enum([
  "none",
  "own",
  "assigned",
  "own_assigned",
  "team",
  "department",
  "company",
]);
const resourceGrant = z.object({
  read: z.boolean().optional(),
  create: z.boolean().optional(),
  write: z.boolean().optional(),
  delete: z.boolean().optional(),
  scope: scope.optional(),
});

export const roleInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional(),
  inheritedRoleIds: z.array(z.string().min(1)).max(20).default([]),
  appAccess: z
    .record(
      z.enum(MODULES.map((module) => module.key) as [string, ...string[]]),
      accessLevel,
    )
    .default({}),
  resources: z.record(z.string().min(3).max(100), resourceGrant).default({}),
  actions: z.record(z.string().min(3).max(120), z.boolean()).default({}),
  fields: z
    .record(
      z.string(),
      z.record(
        z.string(),
        z.object({
          read: z.boolean().optional(),
          write: z.boolean().optional(),
          mask: z.boolean().optional(),
        }),
      ),
    )
    .default({}),
  approvalLimits: z.record(z.string(), z.number().nonnegative()).default({}),
});
