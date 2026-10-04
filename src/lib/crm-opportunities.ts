import { FieldValue } from "firebase-admin/firestore";
import { opportunityInput, opportunityUpdateInput } from "./crm-model";
import { getAdmin } from "./firebase-admin";
import {
  CrmError,
  demand,
  history,
  notify,
  plainDoc,
  validateLinks,
  crmReadable,
  demandWritable,
} from "./crm-server";
import type { CompanyAccess } from "./authorization";
import { opportunityStatus, type StageType } from "./crm-workflow";
export async function createOpportunity(
  companyId: string,
  access: CompanyAccess,
  raw: unknown,
  recordId?: string,
) {
  demand(access, "opportunities", "create");
  if (raw && typeof raw === "object") demandWritable(access, Object.keys(raw));
  const data = opportunityInput.parse(raw),
    db = getAdmin().db;
  const ownerId = data.ownerId === undefined ? access.user.uid : data.ownerId;
  if (ownerId !== access.user.uid) demand(access, "opportunities", "assign");
  const ref = recordId
    ? db.doc(`companies/${companyId}/crmOpportunities/${recordId}`)
    : db.collection(`companies/${companyId}/crmOpportunities`).doc();
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return;
    const [stage, company] = await Promise.all([
      tx.get(
        db.doc(`companies/${companyId}/crmPipelineStages/${data.stageId}`),
      ),
      tx.get(db.doc(`companies/${companyId}`)),
    ]);
    if (!stage.exists || stage.data()?.active === false)
      throw new CrmError("Select an active stage");
    await validateLinks(db, companyId, { ...data, ownerId }, tx, access);
    const status = opportunityStatus(stage.data()!.stageType as StageType);
    if (status !== "open") demand(access, "opportunities", "close");
    if (status === "lost" && !data.lostReasonId)
      throw new CrmError("Select a lost reason");
    tx.create(ref, {
      ...data,
      ownerId,
      companyId,
      status,
      archived: false,
      version: 1,
      currency: company.data()?.currency ?? data.currency,
      createdBy: access.user.uid,
      updatedBy: access.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMeaningfulAt: FieldValue.serverTimestamp(),
      closedAt: status === "open" ? null : FieldValue.serverTimestamp(),
    });
    history(db, tx, companyId, access, ref.id, "opportunity_created", {
      stage: { from: null, to: stage.data()!.name },
    });
    if (ownerId && ownerId !== access.user.uid)
      notify(
        db,
        tx,
        companyId,
        ownerId,
        `${data.name} was assigned to you`,
        ref.id,
      );
  });
  return crmReadable(access, plainDoc(await ref.get()));
}
export async function updateOpportunity(
  companyId: string,
  recordId: string,
  access: CompanyAccess,
  raw: unknown,
) {
  const { expectedVersion, ...data } = opportunityUpdateInput.parse(raw);
  if (!Object.keys(data).length) throw new CrmError("No changes supplied");
  demandWritable(access, Object.keys(data));
  const db = getAdmin().db,
    ref = db.doc(`companies/${companyId}/crmOpportunities/${recordId}`);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new CrmError("Opportunity not found", 404);
    const current = doc.data()!;
    demand(access, "opportunities", "view", current);
    if (expectedVersion === undefined)
      throw new CrmError("Reload the opportunity before saving", 409);
    if (expectedVersion !== Number(current.version ?? 0))
      throw new CrmError(
        "This opportunity changed. Reload before saving.",
        409,
      );
    const fields = Object.keys(data);
    if (
      fields.some((f) => !["stageId", "lostReasonId", "lostNotes"].includes(f))
    )
      demand(access, "opportunities", "edit", current);
    if (fields.some((f) => ["lostReasonId", "lostNotes"].includes(f)))
      demand(access, "opportunities", "close", current);
    if (data.ownerId !== undefined && data.ownerId !== current.ownerId)
      demand(access, "opportunities", "assign", current);
    if (
      data.salesTeamId !== undefined &&
      data.salesTeamId !== current.salesTeamId
    )
      demand(access, "opportunities", "assign", current);
    await validateLinks(db, companyId, data, tx, access);
    const updates: Record<string, unknown> = {
      ...data,
      version: Number(current.version ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      lastMeaningfulAt: FieldValue.serverTimestamp(),
      updatedBy: access.user.uid,
    };
    const changes: Record<string, unknown> = Object.fromEntries(
      fields
        .filter(
          (f) =>
            JSON.stringify(current[f]) !==
            JSON.stringify(data[f as keyof typeof data]),
        )
        .map((f) => [
          f,
          {
            from: current[f] ?? null,
            to: data[f as keyof typeof data] ?? null,
          },
        ]),
    );
    if (data.stageId && data.stageId !== current.stageId) {
      demand(access, "opportunities", "moveStage", current);
      const stage = await tx.get(
        db.doc(`companies/${companyId}/crmPipelineStages/${data.stageId}`),
      );
      const old = current.stageId
        ? await tx.get(
            db.doc(
              `companies/${companyId}/crmPipelineStages/${current.stageId}`,
            ),
          )
        : null;
      if (!stage.exists || stage.data()?.active === false)
        throw new CrmError("Stage is not active");
      const status = opportunityStatus(stage.data()!.stageType as StageType);
      if (status !== "open" || ["won", "lost"].includes(current.status))
        demand(access, "opportunities", "close", current);
      if (status === "lost" && !(data.lostReasonId ?? current.lostReasonId))
        throw new CrmError("Select a lost reason");
      updates.status = status;
      updates.closedAt =
        status === "open" ? null : FieldValue.serverTimestamp();
      changes.stageId = {
        from: old?.data()?.name ?? current.stageId,
        to: stage.data()!.name,
      };
      tx.create(db.collection(`companies/${companyId}/crmStageHistory`).doc(), {
        companyId,
        opportunityId: recordId,
        fromStageId: current.stageId ?? null,
        toStageId: data.stageId,
        actorId: access.user.uid,
        changedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(ref, updates);
    history(
      db,
      tx,
      companyId,
      access,
      recordId,
      data.stageId ? "stage_changed" : "opportunity_updated",
      changes,
    );
    if (
      data.ownerId &&
      data.ownerId !== current.ownerId &&
      data.ownerId !== access.user.uid
    )
      notify(
        db,
        tx,
        companyId,
        data.ownerId,
        `${data.name ?? current.name} was assigned to you`,
        recordId,
      );
  });
  return crmReadable(access, plainDoc(await ref.get()));
}
