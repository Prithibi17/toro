import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdmin } from "@/lib/firebase-admin";
import {
  authorizeCompany,
  authorizationStatus,
  canReadTask,
} from "@/lib/authorization";
import { canPostTodoProgress } from "@/lib/todo-completion";

const input = z.object({
  content: z.string().trim().min(1).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; taskId: string }> },
) {
  const { companyId, taskId } = await params;
  const auth = await authorizeCompany(companyId, { module: "todo" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  try {
    const data = input.parse(await req.json());
    const db = getAdmin().db;
    const task = await db.doc(`companies/${companyId}/tasks/${taskId}`).get();
    if (!task.exists)
      return NextResponse.json({ error: "To-Do not found" }, { status: 404 });
    if (!canReadTask(auth.access.user.uid, auth.access.membership, task.data()!))
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (!canPostTodoProgress(auth.access.user.uid, task.data()?.assigneeIds))
      return NextResponse.json(
        { error: "Only an employee assigned to this To-Do can post a progress update" },
        { status: 403 },
      );
    const actorName =
      auth.access.user.name ?? auth.access.user.email ?? "Workspace member";
    const timestamp = new Date().toISOString();
    const ref = db.collection(`companies/${companyId}/todoHistory`).doc();
    await ref.create({
      todoId: taskId,
      actorId: auth.access.user.uid,
      actorName,
      eventType: "progress_update",
      content: data.content,
      timestamp: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      {
        update: {
          id: ref.id,
          todoId: taskId,
          actorId: auth.access.user.uid,
          actorName,
          eventType: "progress_update",
          content: data.content,
          timestamp,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Write a progress update up to 2,000 characters"
            : "Could not save progress update",
      },
      { status: 400 },
    );
  }
}
