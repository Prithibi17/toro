import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { getAdmin } from "@/lib/firebase-admin";
import { memberRemovalError } from "@/lib/member-removal";

const input = z
  .object({
    mode: z.enum(["leave", "reassign"]),
    reassignTo: z.string().min(1).max(128).optional(),
  })
  .refine((value) => value.mode !== "reassign" || value.reassignTo, {
    message: "Choose an active member for reassignment",
  });
async function load(companyId: string, userId: string) {
  const auth = await authorizeCompany(companyId, {
    permission: "members.manage",
  });
  if (!auth.ok)
    return {
      error: NextResponse.json(
        { error: "Access denied" },
        { status: authorizationStatus(auth.reason) },
      ),
    };
  const db = getAdmin().db,
    targetRef = db.doc(`companies/${companyId}/members/${userId}`),
    [target, admins] = await Promise.all([
      targetRef.get(),
      db
        .collection(`companies/${companyId}/members`)
        .where("status", "==", "active")
        .where("role", "in", ["owner", "admin"])
        .get(),
    ]);
  if (!target.exists)
    return {
      error: NextResponse.json({ error: "Member not found" }, { status: 404 }),
    };
  const safeguard = memberRemovalError(
    auth.access.user.uid,
    auth.access.membership,
    { id: target.id, ...target.data() },
    admins.size,
  );
  if (safeguard)
    return { error: NextResponse.json({ error: safeguard }, { status: 409 }) };
  return { auth, db, target, targetRef };
}
async function work(
  db: FirebaseFirestore.Firestore,
  companyId: string,
  userId: string,
) {
  const now = new Date();
  const [tasks, opportunities, activities, meetings] = await Promise.all([
    db
      .collection(`companies/${companyId}/tasks`)
      .where("assigneeIds", "array-contains", userId)
      .limit(150)
      .get(),
    db
      .collection(`companies/${companyId}/crmOpportunities`)
      .where("ownerId", "==", userId)
      .limit(150)
      .get(),
    db
      .collection(`companies/${companyId}/crmActivities`)
      .where("assigneeId", "==", userId)
      .limit(150)
      .get(),
    db
      .collection(`companies/${companyId}/calendarEvents`)
      .where("attendeeIds", "array-contains", userId)
      .limit(150)
      .get()
      .catch(() => null),
  ]);
  return {
    tasks: tasks.docs.filter(
      (doc) => !doc.data().archivedAt && !doc.data().completedAt,
    ),
    opportunities: opportunities.docs.filter(
      (doc) => !["won", "lost", "archived"].includes(String(doc.data().status)),
    ),
    activities: activities.docs.filter(
      (doc) =>
        doc.data().status !== "completed" &&
        (!doc.data().dueAt?.toDate || doc.data().dueAt.toDate() >= now),
    ),
    meetings: (meetings?.docs ?? []).filter(
      (doc) => !doc.data().end?.toDate || doc.data().end.toDate() >= now,
    ),
  };
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string; userId: string }> },
) {
  const { companyId, userId } = await params,
    result = await load(companyId, userId);
  if ("error" in result) return result.error;
  const assigned = await work(result.db, companyId, userId);
  return NextResponse.json({
    member: {
      id: result.target.id,
      displayName:
        result.target.data()?.displayName ??
        result.target.data()?.email ??
        "Member",
      role: result.target.data()?.role,
    },
    counts: {
      todos: assigned.tasks.length,
      opportunities: assigned.opportunities.length,
      activities: assigned.activities.length,
      meetings: assigned.meetings.length,
    },
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; userId: string }> },
) {
  const { companyId, userId } = await params,
    result = await load(companyId, userId);
  if ("error" in result) return result.error;
  try {
    const data = input.parse(await req.json()),
      assigned = await work(result.db, companyId, userId);
    let replacement: FirebaseFirestore.DocumentSnapshot | null = null;
    if (data.mode === "reassign") {
      if (data.reassignTo === userId)
        return NextResponse.json(
          { error: "Choose a different member" },
          { status: 400 },
        );
      replacement = await result.db
        .doc(`companies/${companyId}/members/${data.reassignTo}`)
        .get();
      if (!replacement.exists || replacement.data()?.status !== "active")
        return NextResponse.json(
          { error: "Replacement must be an active workspace member" },
          { status: 400 },
        );
    }
    const batch = result.db.batch(),
      actorId = result.auth.access.user.uid,
      removedName = String(
        result.target.data()?.displayName ??
          result.target.data()?.email ??
          "Member",
      );
    if (replacement) {
      for (const doc of assigned.tasks)
        batch.update(doc.ref, {
          assigneeIds: [replacement.id],
          updatedBy: actorId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      for (const doc of assigned.opportunities)
        batch.update(doc.ref, {
          ownerId: replacement.id,
          updatedBy: actorId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      for (const doc of assigned.activities)
        batch.update(doc.ref, {
          assigneeId: replacement.id,
          updatedBy: actorId,
          updatedAt: FieldValue.serverTimestamp(),
        });
    }
    const membershipUpdate = {
      status: "removed",
      removedAt: FieldValue.serverTimestamp(),
      removedBy: actorId,
      permissionVersion: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    batch.update(result.targetRef, membershipUpdate);
    batch.set(
      result.db.doc(`users/${userId}/companyMemberships/${companyId}`),
      membershipUpdate,
      { merge: true },
    );
    appendAudit(
      result.db,
      companyId,
      {
        actorId,
        action: "security.member.removed",
        entityType: "member",
        entityId: userId,
        metadata: {
          memberName: removedName,
          reassignedTo: replacement?.id ?? null,
          todos: assigned.tasks.length,
          opportunities: assigned.opportunities.length,
          activities: assigned.activities.length,
          meetings: assigned.meetings.length,
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
            ? error.issues[0]?.message
            : "Could not remove employee",
      },
      { status: 400 },
    );
  }
}
