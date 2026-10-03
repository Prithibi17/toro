import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { appendAudit } from "@/lib/audit";

const input = z.object({
  name: z.string().trim().min(2).max(100),
  businessCategory: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
  city: z.string().trim().max(80),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  timezone: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine((value) => {
      try {
        Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Invalid timezone"),
  email: z.union([z.literal(""), z.string().email()]),
  phone: z.string().trim().max(40),
  website: z.union([z.literal(""), z.string().url()]),
  address: z.string().trim().max(300),
  description: z.string().trim().max(500),
});

function canConfigure(access: Awaited<ReturnType<typeof authorizeCompany>>) {
  if (!access.ok) return false;
  const { membership, effectivePermissions } = access.access;
  return (
    membership.role === "owner" ||
    membership.role === "admin" ||
    effectivePermissions.actions["security.members.manage"] === true ||
    effectivePermissions.legacyPermissions["members.manage"] === true
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const authz = await authorizeCompany(companyId);
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  if (!canConfigure(authz))
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  try {
    const data = input.parse(await req.json());
    const db = getAdmin().db;
    const companyRef = db.doc(`companies/${companyId}`);
    const before = await companyRef.get();
    if (!before.exists)
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const batch = db.batch();
    batch.update(companyRef, {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authz.access.user.uid,
    });
    appendAudit(
      db,
      companyId,
      {
        actorId: authz.access.user.uid,
        action: "company.settings_updated",
        entityType: "company",
        entityId: companyId,
        metadata: { timezone: data.timezone, currency: data.currency },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ company: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? (error.issues[0]?.message ?? "Invalid settings")
            : "Could not save settings",
      },
      { status: 400 },
    );
  }
}
