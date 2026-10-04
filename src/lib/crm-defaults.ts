import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { CRM_COLLECTIONS } from "./crm-model";

export const DEFAULT_CRM_STAGES = [
  { name: "New", stageType: "OPEN", probability: 10 },
  { name: "Qualified", stageType: "OPEN", probability: 30 },
  { name: "Proposition", stageType: "OPEN", probability: 60 },
  { name: "Negotiation", stageType: "OPEN", probability: 80 },
  { name: "Won", stageType: "WON", probability: 100, folded: true },
  { name: "Lost", stageType: "LOST", probability: 0, folded: true },
] as const;

export function createDefaultCrmStages(
  db: Firestore,
  companyId: string,
  actorId: string,
  writer: Transaction,
) {
  DEFAULT_CRM_STAGES.forEach((stage, sequence) => {
    const ref = db
      .collection(`companies/${companyId}/${CRM_COLLECTIONS.stages}`)
      .doc();
    writer.create(ref, {
      ...stage,
      companyId,
      sequence,
      order: sequence,
      active: true,
      createdBy: actorId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function ensureDefaultCrmStages(
  db: Firestore,
  companyId: string,
  actorId: string,
) {
  const collection = db.collection(
    `companies/${companyId}/${CRM_COLLECTIONS.stages}`,
  );
  const existing = await collection.limit(1).get();
  if (!existing.empty) return;
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(collection.limit(1));
    if (!fresh.empty) return;
    createDefaultCrmStages(db, companyId, actorId, transaction);
  });
}
