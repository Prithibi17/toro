import { z } from "zod";
import { MODULES } from "./types";

const moduleKey = z.enum(
  MODULES.map((module) => module.key) as [string, ...string[]],
);

export const memberAccessUpdateInput = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "manager", "employee", "intern"]).optional(),
  roleIds: z.array(z.string().min(1)).max(20).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  accessExpiresAt: z.string().datetime().nullable().optional(),
  departmentIds: z.array(z.string().min(1)).max(20).optional(),
  appAccess: z
    .partialRecord(moduleKey, z.enum(["none", "user"]))
    .optional(),
  permissionOverrides: z
    .record(z.string(), z.enum(["allow", "deny"]))
    .optional(),
});
