import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  crmAccess,
  crmError,
  demand,
  CrmError,
  history,
  plainDoc,
} from "@/lib/crm-server";
import { activityParent } from "@/lib/crm-activities";
import { getAdmin } from "@/lib/firebase-admin";
const input = z
  .object({
    status: z.enum(["completed", "cancelled"]),
    outcome: z.string().max(2000).default(""),
  })
  .strict();
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string; recordId: string }> },
) {
  try {
    const { companyId, recordId } = await params,
      access = await crmAccess(companyId),
      data = input.parse(await req.json()),
      db = getAdmin().db,
      ref = db.doc(`companies/${companyId}/crmActivities/${recordId}`);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new CrmError("Activity not found", 404);
      const current = doc.data()!;
      demand(access, "activities", "edit", current);
      const parent = await activityParent(companyId, access, current, tx);
      const related = await tx.get(
        db
          .collection(`companies/${companyId}/crmActivities`)
          .where("relatedId", "==", current.relatedId),
      );
      const remaining = related.docs
        .filter(
          (d) =>
            d.id !== recordId &&
            d.data().relatedType === current.relatedType &&
            d.data().status === "scheduled" &&
            d.data().dueAt,
        )
        .sort((a, b) =>
          String(a.data().dueAt).localeCompare(String(b.data().dueAt)),
        );
      if (current.status === data.status) return;
      tx.update(ref, {
        ...data,
        completedBy: access.user.uid,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (current.relatedType === "opportunity") {
        const next = remaining[0];
        tx.update(parent.ref, {
          nextActivityId: next?.id ?? null,
          nextActivityTitle: next?.data().title ?? null,
          nextActivityType: next?.data().type ?? null,
          nextActivityDueAt: next?.data().dueAt ?? null,
          lastMeaningfulAt: FieldValue.serverTimestamp(),
        });
        history(
          db,
          tx,
          companyId,
          access,
          String(current.relatedId),
          `activity_${data.status}`,
          {},
          `${current.title}: ${data.outcome}`,
        );
      }
      if (current.calendarEventId && data.status === "cancelled")
        tx.update(
          db.doc(
            `companies/${companyId}/calendarEvents/${current.calendarEventId}`,
          ),
          { status: "cancelled", updatedAt: FieldValue.serverTimestamp() },
        );
    });
    return NextResponse.json({ activity: plainDoc(await ref.get()) });
  } catch (e) {
    return crmError(e);
  }
}
