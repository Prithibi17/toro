import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { crmGrant, crmRecordAllowed } from "@/lib/access-policy";
import { appendAudit } from "@/lib/audit";
import { CRM_COLLECTIONS, opportunityUpdateInput } from "@/lib/crm-model";
import { opportunityStatus, type StageType } from "@/lib/crm-workflow";
import { getAdmin } from "@/lib/firebase-admin";
import type { CrmScope } from "@/lib/types";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string; recordId: string }> },
) {
  const { companyId, recordId } = await params;
  const auth = await authorizeCompany(companyId, { module: "crm" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  try {
    const input = opportunityUpdateInput.parse(await req.json());
    const action = input.stageId ? "moveStage" : "edit";
    const grant = crmGrant(auth.access.membership, "opportunities", action);
    if (grant === false || grant === "none")
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const db = getAdmin().db;
    const ref = db.doc(
      `companies/${companyId}/${CRM_COLLECTIONS.opportunities}/${recordId}`,
    );
    await db.runTransaction(async (transaction) => {
      const opportunityDoc = await transaction.get(ref);
      if (!opportunityDoc.exists) throw new Error("Opportunity not found");
      const current = opportunityDoc.data()!;
      const view = crmGrant(auth.access.membership, "opportunities", "view");
      if (
        typeof view !== "string" ||
        !crmRecordAllowed(
          auth.access.user.uid,
          auth.access.membership,
          view as CrmScope,
          current,
        )
      )
        throw new Error("Access denied");
      let stage: FirebaseFirestore.DocumentSnapshot | null = null;
      if (input.stageId) {
        stage = await transaction.get(
          db.doc(
            `companies/${companyId}/${CRM_COLLECTIONS.stages}/${input.stageId}`,
          ),
        );
        if (!stage.exists || stage.data()?.active === false)
          throw new Error("CRM stage is not active");
      }
      const updates: Record<string, unknown> = {
        ...input,
        updatedBy: auth.access.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (stage) {
        updates.status = opportunityStatus(
          stage.data()!.stageType as StageType,
        );
        updates.probability = input.probability ?? stage.data()!.probability;
        if (updates.status === "won" || updates.status === "lost")
          updates.closedAt = FieldValue.serverTimestamp();
        else updates.closedAt = null;
      }
      transaction.update(ref, updates);
      if (input.stageId && input.stageId !== current.stageId) {
        const stageHistory = db
          .collection(`companies/${companyId}/${CRM_COLLECTIONS.stageHistory}`)
          .doc();
        transaction.create(stageHistory, {
          companyId,
          opportunityId: recordId,
          fromStageId: current.stageId ?? null,
          toStageId: input.stageId,
          actorId: auth.access.user.uid,
          changedAt: FieldValue.serverTimestamp(),
        });
      }
      const timeline = db
        .collection(`companies/${companyId}/${CRM_COLLECTIONS.timeline}`)
        .doc();
      transaction.create(timeline, {
        entityType: "opportunity",
        entityId: recordId,
        eventType: input.stageId ? "stage_changed" : "updated",
        actorId: auth.access.user.uid,
        changes: Object.fromEntries(
          Object.keys(input).map((key) => [
            key,
            {
              from: current[key] ?? null,
              to: input[key as keyof typeof input] ?? null,
            },
          ]),
        ),
        timestamp: FieldValue.serverTimestamp(),
      });
      appendAudit(
        db,
        companyId,
        {
          actorId: auth.access.user.uid,
          action: input.stageId
            ? "crm.opportunity_stage_changed"
            : "crm.opportunity_updated",
          entityType: "opportunity",
          entityId: recordId,
          metadata: input.stageId ? { stageId: input.stageId } : {},
        },
        transaction,
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Invalid opportunity update"
        : error instanceof Error
          ? error.message
          : "Could not update opportunity";
    return NextResponse.json(
      { error: message },
      {
        status: message.endsWith("not found")
          ? 404
          : message === "Access denied"
            ? 403
            : 400,
      },
    );
  }
}
