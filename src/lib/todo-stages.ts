import { FieldValue, type Firestore } from "firebase-admin/firestore";
export const DEFAULT_TODO_STAGES = [
  { name: "To Do", legacyStatus: "todo", isDone: false },
  { name: "In Progress", legacyStatus: "in-progress", isDone: false },
  { name: "Done", legacyStatus: "done", isDone: true },
] as const;

type TodoStage = {
  id: string;
  isDone?: boolean;
  legacyStatus?: string;
};

type TodoStageState = {
  stageId?: unknown;
  status?: unknown;
  completedAt?: unknown;
};

/**
 * Tasks store the personal stage ID of the last person who moved them, while
 * every workspace member owns a different set of personal stage IDs. Resolve
 * that shared task state to the equivalent stage for the current viewer.
 */
export function resolveTodoStageId(
  task: TodoStageState,
  stages: TodoStage[],
) {
  if (!stages.length) return undefined;

  const isCompleted = Boolean(task.completedAt) || task.status === "done";
  if (isCompleted) {
    const doneStage = stages.find(
      (stage) => stage.isDone || stage.legacyStatus === "done",
    );
    if (doneStage) return doneStage.id;
  }

  const personalStage = stages.find((stage) => stage.id === task.stageId);
  if (personalStage) return personalStage.id;

  const equivalentStage = stages.find(
    (stage) => stage.legacyStatus === task.status,
  );
  return equivalentStage?.id ?? stages[0]?.id;
}

export async function ensureTodoStages(
  db: Firestore,
  companyId: string,
  userId: string,
) {
  const c = db.collection(`companies/${companyId}/todoStages`),
    q = c.where("userId", "==", userId).limit(1),
    exists = await q.get();
  if (!exists.empty) return;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(q);
    if (!fresh.empty) return;
    DEFAULT_TODO_STAGES.forEach((s, sequence) =>
      tx.create(c.doc(), {
        ...s,
        companyId,
        userId,
        sequence,
        isFolded: s.isDone,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
  });
}
