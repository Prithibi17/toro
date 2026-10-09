import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/firebase-admin";
import { authorizeCompany, canReadTask } from "@/lib/authorization";
import { TodoRecord } from "@/components/todo-record";
import { serializeFirestore } from "@/lib/firestore-serialization";
import { canAssignTodoTo } from "@/lib/todo-assignment";
import { can } from "@/lib/can";
import {
  canChangeTodoStage,
  canPostTodoProgress,
} from "@/lib/todo-completion";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; taskId: string }>;
}) {
  const { companyId, taskId } = await params,
    auth = await authorizeCompany(companyId, { module: "todo" });
  if (!auth.ok) notFound();
  const ctx = auth.access;
  const db = getAdmin().db,
    doc = await db.doc(`companies/${companyId}/tasks/${taskId}`).get();
  if (!doc.exists || !canReadTask(ctx.user.uid, ctx.membership, doc.data()!))
    notFound();
  const [stages, history, members] = await Promise.all([
    db
      .collection(`companies/${companyId}/todoStages`)
      .where("userId", "==", ctx.user.uid)
      .get(),
    db
      .collection(`companies/${companyId}/todoHistory`)
      .where("todoId", "==", taskId)
      .limit(100)
      .get(),
    db.collection(`companies/${companyId}/members`).limit(500).get(),
  ]);
  const assigneeId = String(doc.data()?.assigneeIds?.[0] ?? "");
  const assigneeDoc = members.docs.find((member) => member.id === assigneeId);
  return (
    <TodoRecord
      companyId={companyId}
      task={
        serializeFirestore({ id: doc.id, ...doc.data() }) as Record<
          string,
          unknown
        > & {
          id: string;
        }
      }
      stages={serializeFirestore(
        stages.docs
          .map(
            (d) =>
              ({ id: d.id, ...d.data() }) as Record<string, unknown> & {
                id: string;
              },
          )
          .sort((a, b) => Number(a.sequence) - Number(b.sequence)),
      )}
      history={
        serializeFirestore(
          history.docs.map((d) => ({ id: d.id, ...d.data() })),
        ) as Array<Record<string, unknown> & { id: string }>
      }
      members={
        serializeFirestore(
          members.docs
            .filter((member) =>
              canAssignTodoTo(ctx.user.uid, ctx.membership, {
                id: member.id,
                ...member.data(),
              }),
            )
            .map((member) => ({ id: member.id, ...member.data() })),
        ) as Array<Record<string, unknown> & { id: string }>
      }
      currentAssignee={
        assigneeDoc
          ? serializeFirestore({ id: assigneeDoc.id, ...assigneeDoc.data() })
          : assigneeId
            ? {
                id: assigneeId,
                displayName: "Former member",
                status: "unavailable",
              }
            : undefined
      }
      canDelete={can(ctx, "todo.delete", "todo")}
      canChangeStage={canChangeTodoStage(ctx.user.uid, doc.data()!)}
      canPostProgress={canPostTodoProgress(ctx.user.uid, doc.data()?.assigneeIds)}
    />
  );
}
