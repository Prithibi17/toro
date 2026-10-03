import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { getAdmin } from "@/lib/firebase-admin";
import { canReadTask } from "@/lib/authorization";
import { TodoRecord } from "@/components/todo-record";
import { serializeFirestore } from "@/lib/firestore-serialization";
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string; taskId: string }>;
}) {
  const { companyId, taskId } = await params,
    ctx = await requireMembership(companyId);
  if (!ctx || !ctx.membership.enabledModules?.includes("todo")) notFound();
  const db = getAdmin().db,
    doc = await db.doc(`companies/${companyId}/tasks/${taskId}`).get();
  if (!doc.exists || !canReadTask(ctx.user.uid, ctx.membership, doc.data()!))
    notFound();
  const [stages, history] = await Promise.all([
    db
      .collection(`companies/${companyId}/todoStages`)
      .where("userId", "==", ctx.user.uid)
      .get(),
    db
      .collection(`companies/${companyId}/todoHistory`)
      .where("todoId", "==", taskId)
      .limit(100)
      .get(),
  ]);
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
    />
  );
}
