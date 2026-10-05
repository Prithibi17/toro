import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { appendAudit } from "@/lib/audit";
import type { PermissionKey } from "@/lib/types";
import { MODULES } from "@/lib/types";
import { SIMPLE_PERMISSIONS } from "@/lib/permission-catalog";
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
const crmScope = z.enum(["none", "own", "team", "department", "all"]);
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
  userType: z.enum(["internal", "portal"]).default("internal"),
  roleIds: z.array(z.string().min(1)).max(20).default([]),
  departmentIds: z.array(z.string()).max(10),
  permissions: z.array(z.enum(keys)).max(keys.length),
  crmPermissions: z.record(z.string(), crmSection).default({}),
});
const updateInput = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "manager", "employee", "intern"]).optional(),
  roleIds: z.array(z.string().min(1)).max(20).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  accessExpiresAt: z.string().datetime().nullable().optional(),
  departmentIds: z.array(z.string().min(1)).max(20).optional(),
  appAccess: z
    .record(
      z.enum(MODULES.map((module) => module.key) as [string, ...string[]]),
      z.enum(["none", "user"]),
    )
    .optional(),
  permissionOverrides: z
    .record(z.string(), z.enum(["allow", "deny"]))
    .optional(),
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
    const roleDocuments = await Promise.all(
      data.roleIds.map((id) =>
        db.doc(`companies/${companyId}/roles/${id}`).get(),
      ),
    );
    if (
      roleDocuments.some(
        (role) => !role.exists || role.data()?.active === false,
      )
    ) {
      return NextResponse.json(
        { error: "One or more roles are invalid" },
        { status: 400 },
      );
    }
    const assignsSecurity = roleDocuments.some(
      (role) => role.data()?.actions?.["security.roles.manage"] === true,
    );
    if (ctx.membership.role !== "owner" && assignsSecurity) {
      return NextResponse.json(
        { error: "Only the company owner can assign security administration" },
        { status: 403 },
      );
    }
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
          userType: data.userType,
          roleIds: data.roleIds,
          permissionVersion: 1,
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
    const invitationCollection = db.collection(
      `companies/${companyId}/invitations`,
    );
    const existingInvitations = await invitationCollection
      .where("email", "==", data.email.toLowerCase())
      .limit(20)
      .get();
    const existingPending = existingInvitations.docs.find(
      (invitation) => invitation.data().status === "pending",
    );
    const ref = existingPending?.ref ?? invitationCollection.doc();
    const batch = db.batch();
    const invitationData = {
      ...data,
      email: data.email.toLowerCase(),
      permissions,
      status: "pending",
      permissionVersion: 1,
      createdBy: ctx.user.uid,
      ...(existingPending
        ? { updatedAt: FieldValue.serverTimestamp() }
        : { createdAt: FieldValue.serverTimestamp() }),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    };
    if (existingPending) batch.set(ref, invitationData, { merge: true });
    else batch.create(ref, invitationData);
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
    return NextResponse.json(
      {
        status: "pending",
        invitationId: ref.id,
        message:
          "Invitation is pending. It will activate automatically after this email creates and verifies a Toro account.",
      },
      { status: 201 },
    );
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

export async function PATCH(
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
  try {
    const data = updateInput.parse(await req.json());
    const db = getAdmin().db;
    const memberRef = db.doc(`companies/${companyId}/members/${data.userId}`);
    const target = await memberRef.get();
    if (!target.exists)
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const current = target.data()!;
    if (
      authz.access.membership.role !== "owner" &&
      (current.role === "owner" ||
        current.role === "admin" ||
        data.role === "admin")
    )
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (
      data.permissionOverrides &&
      Object.keys(data.permissionOverrides).some(
        (key) =>
          !SIMPLE_PERMISSIONS.some((permission) => permission.key === key),
      )
    )
      return NextResponse.json(
        { error: "Unknown access permission" },
        { status: 400 },
      );
    if (
      authz.access.membership.role !== "owner" &&
      (data.role === "admin" ||
        data.permissionOverrides?.["employees.manage"] === "allow")
    )
      return NextResponse.json(
        { error: "Only the owner can grant protected administration" },
        { status: 403 },
      );
    if (current.role === "owner" && (data.status === "suspended" || data.role))
      return NextResponse.json(
        { error: "Transfer ownership before changing the Owner" },
        { status: 409 },
      );
    if (data.roleIds) {
      const roleDocuments = await Promise.all(
        data.roleIds.map((id) =>
          db.doc(`companies/${companyId}/roles/${id}`).get(),
        ),
      );
      if (
        roleDocuments.some(
          (role) => !role.exists || role.data()?.active === false,
        )
      )
        return NextResponse.json(
          { error: "One or more roles are invalid" },
          { status: 400 },
        );
      if (
        authz.access.membership.role !== "owner" &&
        roleDocuments.some(
          (role) => role.data()?.actions?.["security.roles.manage"] === true,
        )
      )
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const update = {
      ...(data.role ? { role: data.role } : {}),
      ...(data.roleIds ? { roleIds: data.roleIds } : {}),
      ...(data.departmentIds ? { departmentIds: data.departmentIds } : {}),
      ...(data.appAccess ? { appAccess: data.appAccess } : {}),
      ...(data.permissionOverrides
        ? { permissionOverrides: data.permissionOverrides }
        : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.accessExpiresAt !== undefined
        ? {
            accessExpiresAt: data.accessExpiresAt
              ? new Date(data.accessExpiresAt)
              : FieldValue.delete(),
          }
        : {}),
      permissionVersion: FieldValue.increment(1),
      updatedBy: authz.access.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const batch = db.batch();
    batch.update(memberRef, update);
    batch.set(
      db.doc(`users/${data.userId}/companyMemberships/${companyId}`),
      update,
      { merge: true },
    );
    appendAudit(
      db,
      companyId,
      {
        actorId: authz.access.user.uid,
        action:
          data.status === "suspended"
            ? "security.member.suspended"
            : "security.member.access_updated",
        entityType: "member",
        entityId: data.userId,
        metadata: {
          permissionVersionChanged: true,
          role: data.role ?? current.role,
          addedAccess: JSON.stringify(
            Object.entries(data.permissionOverrides ?? {})
              .filter(([, effect]) => effect === "allow")
              .map(([key]) => key),
          ),
          restrictions: JSON.stringify(
            Object.entries(data.permissionOverrides ?? {})
              .filter(([, effect]) => effect === "deny")
              .map(([key]) => key),
          ),
        },
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Invalid request"
            : "Could not update member access",
      },
      { status: 400 },
    );
  }
}
