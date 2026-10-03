import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { appendAudit } from "@/lib/audit";
import type { PermissionKey } from "@/lib/types";
const keys = [
  "members.manage",
  "apps.manage",
  "tasks.create",
  "tasks.move",
  "tasks.assign",
  "crm.manage",
  "contacts.manage",
  "sales.manage",
] as const;
const crmScope = z.enum(["none", "own", "department", "all"]);
const crmSection = z.object({
  view: crmScope.default("none"),
  create: z.boolean().default(false),
  edit: crmScope.default("none"),
  delete: crmScope.default("none"),
  assign: crmScope.default("none"),
  moveStage: z.boolean().default(false),
  close: z.boolean().default(false),
  manage: z.boolean().default(false),
});
const input = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(2).max(100),
  role: z.enum(["admin", "manager", "employee", "intern"]),
  departmentIds: z.array(z.string()).max(10),
  permissions: z.array(z.enum(keys)).max(keys.length),
  crmPermissions: z.record(z.string(), crmSection).default({}),
});
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const authz = await authorizeCompany(companyId, {
    permission: "members.manage",
  });
  if (!authz.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(authz.reason) },
    );
  const ctx = authz.access;
  try {
    const data = input.parse(await req.json());
    if (
      ctx.membership.role !== "owner" &&
      (data.role === "admin" ||
        data.permissions.includes("members.manage") ||
        data.permissions.includes("apps.manage"))
    ) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const { auth, db } = getAdmin();
    let target;
    try {
      target = await auth.getUserByEmail(data.email);
    } catch {}
    const permissions = Object.fromEntries(
      keys.map((k) => [k, data.permissions.includes(k)]),
    ) as Record<PermissionKey, boolean>;
    const company = (await db.doc(`companies/${companyId}`).get()).data();
    if (!company)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target) {
      const memberRef = db.doc(`companies/${companyId}/members/${target.uid}`);
      const mirrorRef = db.doc(
        `users/${target.uid}/companyMemberships/${companyId}`,
      );
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(memberRef);
        if (existing.exists)
          throw new Error("This user is already a company member");
        const membership = {
          companyId,
          companyName: company.name,
          role: data.role,
          status: "active",
          departmentIds: data.departmentIds,
          permissions,
          crmPermissions: data.crmPermissions,
          enabledModules: company.enabledModules || [],
          createdAt: FieldValue.serverTimestamp(),
        };
        tx.create(memberRef, {
          ...membership,
          userId: target.uid,
          email: data.email.toLowerCase(),
          displayName: data.displayName,
          employmentType: data.role,
        });
        tx.set(mirrorRef, membership);
        const note = db
          .collection(`companies/${companyId}/notifications`)
          .doc();
        tx.create(note, {
          companyId,
          recipientId: target.uid,
          eventType: "company.member_added",
          title: `You joined ${company.name}`,
          message: `You were added as ${data.role}.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        appendAudit(
          db,
          companyId,
          {
            actorId: ctx.user.uid,
            action: "member.added",
            entityType: "member",
            entityId: target.uid,
            metadata: { role: data.role },
          },
          tx,
        );
      });
      return NextResponse.json({ status: "active" }, { status: 201 });
    }
    const ref = db.collection(`companies/${companyId}/invitations`).doc();
    const batch = db.batch();
    batch.create(ref, {
      ...data,
      email: data.email.toLowerCase(),
      permissions,
      status: "pending",
      createdBy: ctx.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    appendAudit(
      db,
      companyId,
      {
        actorId: ctx.user.uid,
        action: "member.invited",
        entityType: "invitation",
        entityId: ref.id,
        metadata: { role: data.role },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ status: "pending" }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid request"
            : e instanceof Error
              ? e.message
              : "Could not add member",
      },
      { status: 400 },
    );
  }
}
