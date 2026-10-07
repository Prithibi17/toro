import { z } from "zod";
const fields = z.object({
  title: z.string().trim().min(2).max(160),
  start: z.string().datetime(),
  end: z.string().datetime(),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(240).default(""),
  description: z.string().trim().max(3000).default(""),
  status: z.enum(["confirmed", "tentative", "cancelled"]).default("confirmed"),
  attendeeIds: z.array(z.string().max(128)).max(100).default([]),
  relatedType: z.string().max(50).default(""),
  relatedId: z.string().max(128).default(""),
  tags: z.array(z.string().trim().min(1).max(128)).max(30).default([]),
});
export const calendarEventInput = fields.refine(
  (v) => new Date(v.end) > new Date(v.start),
  { message: "End must be after start" },
);
export const calendarEventUpdate = fields
  .partial()
  .refine((v) => !v.start || !v.end || new Date(v.end) > new Date(v.start), {
    message: "End must be after start",
  });
