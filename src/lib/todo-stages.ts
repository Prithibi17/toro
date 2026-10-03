import { FieldValue, type Firestore } from "firebase-admin/firestore";
export const DEFAULT_TODO_STAGES = [
  { name: "To Do", legacyStatus: "todo", isDone: false },
  { name: "In Progress", legacyStatus: "in-progress", isDone: false },
  { name: "Done", legacyStatus: "done", isDone: true },
] as const;
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
