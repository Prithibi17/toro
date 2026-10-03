import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/session";
import { getAdmin } from "@/lib/firebase-admin";
import { canReadTask } from "@/lib/authorization";
import { TodoRecord } from "@/components/todo-record";
const plain = (v: unknown): unknown =>
  v && typeof v === "object" && "toDate" in v
    ? (v as { toDate(): Date }).toDate().toISOString()
    : Array.isArray(v)
      ? v.map(plain)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
        : v;
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
        plain({ id: doc.id, ...doc.data() }) as Record<string, unknown> & {
          id: string;
        }
      }
      stages={stages.docs
        .map(
          (d) =>
            ({ id: d.id, ...d.data() }) as Record<string, unknown> & {
              id: string;
            },
        )
        .sort((a, b) => Number(a.sequence) - Number(b.sequence))}
      history={
        plain(history.docs.map((d) => ({ id: d.id, ...d.data() }))) as Array<
          Record<string, unknown> & { id: string }
        >
      }
    />
  );
}
