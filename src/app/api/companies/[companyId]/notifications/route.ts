import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebase-admin";
import { requireMembership } from "@/lib/session";
import {
  requiresTodoCompletion,
  todoDeadlineStatus,
} from "@/lib/todo-deadline";

const updateSchema = z.object({
  notificationId: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),
  action: z.enum(["markRead", "dismiss"]).default("markRead"),
});

export async function GET(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const ctx = await requireMembership(companyId);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = getAdmin().db;
  const [snap, createdTasks, delegatedTasks, assignedTasks, dismissalSnap] = await Promise.all([
    db
      .collection(`companies/${companyId}/notifications`)
      .where("recipientId", "==", ctx.user.uid)
      .limit(60)
      .get(),
    db
      .collection(`companies/${companyId}/tasks`)
      .where("creatorId", "==", ctx.user.uid)
      .limit(60)
      .get(),
    db
      .collection(`companies/${companyId}/tasks`)
      .where("assignedById", "==", ctx.user.uid)
      .limit(60)
      .get(),
    db
      .collection(`companies/${companyId}/tasks`)
      .where("assigneeIds", "array-contains", ctx.user.uid)
      .limit(60)
      .get(),
    db
      .collection(
        `companies/${companyId}/members/${ctx.user.uid}/notificationDismissals`,
      )
      .limit(200)
      .get(),
  ]);
  const dismissedIds = new Set(dismissalSnap.docs.map((document) => document.id));
  const trackedTasks = new Map<
    string,
    FirebaseFirestore.QueryDocumentSnapshot
  >();
  [...createdTasks.docs, ...delegatedTasks.docs].forEach((document) => {
    const data = document.data();
    if (
      !data.archivedAt &&
      (data.assignedById
        ? data.assignedById === ctx.user.uid
        : data.creatorId === ctx.user.uid) &&
      !data.assigneeIds?.includes(ctx.user.uid)
    )
      trackedTasks.set(document.id, document);
  });
  const assigneeIds = Array.from(
    new Set(
      [...trackedTasks.values()]
        .map((document) => String(document.data().assigneeIds?.[0] ?? ""))
        .filter(Boolean),
    ),
  );
  const assignees = assigneeIds.length
    ? await db.getAll(
        ...assigneeIds.map((userId) =>
          db.doc(`companies/${companyId}/members/${userId}`),
        ),
      )
    : [];
  const assigneeNames = new Map(
    assignees.map((document) => [
      document.id,
      String(
        document.data()?.displayName ?? document.data()?.email ?? "Former member",
      ),
    ]),
  );
  const storedNotifications = snap.docs
    .filter((doc) => doc.data().eventType !== "todo.assignment")
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        read: Boolean(data.read),
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });
  const trackingNotifications = [...trackedTasks.values()].map((document) => {
    const data = document.data();
    const assigneeId = String(data.assigneeIds?.[0] ?? "");
    const completed = Boolean(data.completedAt);
    const status = completed
      ? "Completed"
      : data.status === "in-progress"
        ? "In progress"
        : "Not completed";
    return {
      id: `tracking-${document.id}`,
      title: `Assigned work · ${assigneeNames.get(assigneeId) ?? "Member"}`,
      message: String(data.title ?? "To-Do"),
      read: true,
      eventType: "todo.tracking",
      relatedRecord: { type: "todo", id: document.id },
      href: `/workspace/${companyId}/todo/${document.id}`,
      createdAt:
        data.updatedAt?.toDate?.()?.toISOString() ??
        data.createdAt?.toDate?.()?.toISOString() ??
        null,
      dueDate: String(data.dueDate ?? ""),
      deadlineStatus: todoDeadlineStatus(
        String(data.dueDate ?? ""),
        data.completedAt,
      ),
      taskStatus: status,
      tracking: true,
      completed,
    };
  });
  const assignmentNotifications = assignedTasks.docs
    .filter((document) => !document.data().archivedAt)
    .map((document) => {
      const data = document.data();
      const completed = Boolean(data.completedAt);
      return {
        id: `assignment-${document.id}`,
        title: `${String(data.assignedByName ?? data.creatorName ?? "A workspace member")} assigned you a To-Do`,
        message: String(data.title ?? "To-Do"),
        read: completed,
        eventType: "todo.assignment",
        relatedRecord: { type: "todo", id: document.id },
        href: `/workspace/${companyId}/todo/${document.id}`,
        createdAt:
          data.updatedAt?.toDate?.()?.toISOString() ??
          data.createdAt?.toDate?.()?.toISOString() ??
          null,
        dueDate: String(data.dueDate ?? ""),
        deadlineStatus: todoDeadlineStatus(
          String(data.dueDate ?? ""),
          data.completedAt,
        ),
        requiresCompletion: !completed,
      };
    });
  const notifications = [
    ...storedNotifications,
    ...trackingNotifications,
    ...assignmentNotifications,
  ]
    .filter(
      (notification) =>
        ("requiresCompletion" in notification &&
          notification.requiresCompletion) ||
        !dismissedIds.has(notification.id),
    )
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return NextResponse.json({ notifications });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const ctx = await requireMembership(companyId);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid notification" },
      { status: 400 },
    );
  const admin = getAdmin();
  const { notificationId, action } = parsed.data;
  if (action === "dismiss") {
    if (notificationId.startsWith("assignment-")) {
      const taskId = notificationId.slice("assignment-".length);
      const task = await admin.db
        .doc(`companies/${companyId}/tasks/${taskId}`)
        .get();
      if (
        task.exists &&
        requiresTodoCompletion(
          ctx.user.uid,
          task.data()?.assigneeIds,
          task.data()?.completedAt,
        )
      )
        return NextResponse.json(
          { error: "This deadline warning remains until the To-Do is completed" },
          { status: 409 },
        );
    }
    const stored = await admin.db
      .doc(`companies/${companyId}/notifications/${notificationId}`)
      .get();
    if (stored.exists && stored.data()?.recipientId !== ctx.user.uid)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    await admin.db
      .doc(
        `companies/${companyId}/members/${ctx.user.uid}/notificationDismissals/${notificationId}`,
      )
      .set({
        notificationId,
        dismissedAt: FieldValue.serverTimestamp(),
      });
    return NextResponse.json({ ok: true });
  }
  const ref = admin.db.doc(
    `companies/${companyId}/notifications/${notificationId}`,
  );
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.recipientId !== ctx.user.uid)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (snapshot.data()?.eventType === "todo.assignment") {
    const taskId = String(snapshot.data()?.relatedRecord?.id ?? "");
    const task = taskId
      ? await admin.db.doc(`companies/${companyId}/tasks/${taskId}`).get()
      : null;
    if (
      task?.exists &&
      requiresTodoCompletion(
        ctx.user.uid,
        task.data()?.assigneeIds,
        task.data()?.completedAt,
      )
    )
      return NextResponse.json(
        { error: "This deadline warning remains until the To-Do is completed" },
        { status: 409 },
      );
  }
  await ref.update({ read: true, readAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}
