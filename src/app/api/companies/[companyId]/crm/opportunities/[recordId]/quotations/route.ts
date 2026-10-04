import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import {
  crmError,
  opportunityAccess,
  history,
  plainDoc,
  CrmError,
} from "@/lib/crm-server";
import { hasPermission } from "@/lib/access-policy";
import { getAdmin } from "@/lib/firebase-admin";
const input = z.object({
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(300),
        quantity: z.coerce.number().positive().max(100000),
        unitPrice: z.coerce.number().min(0).max(100000000),
        taxRate: z.coerce.number().min(0).max(100).default(0),
        discount: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1)
    .max(100),
  notes: z.string().max(4000).default(""),
});
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string; recordId: string }> },
) {
  try {
    const { companyId, recordId } = await params,
      { access, record } = await opportunityAccess(companyId, recordId);
    if (
      !access.membership.enabledModules.includes("sales") ||
      !hasPermission(access.membership, "sales.manage")
    )
      throw new CrmError("Sales permission required", 403);
    const data = input.parse(await req.json()),
      db = getAdmin().db,
      ref = db.collection(`companies/${companyId}/salesOrders`).doc(),
      batch = db.batch();
    const total =
      Math.round(
        data.lines.reduce(
          (sum, line) =>
            sum +
            line.quantity *
              line.unitPrice *
              (1 - line.discount / 100) *
              (1 + line.taxRate / 100),
          0,
        ) * 100,
      ) / 100;
    batch.create(ref, {
      ...data,
      companyId,
      opportunityId: recordId,
      customerId: record.customerId ?? record.contactId ?? null,
      title: `Quotation: ${record.name}`,
      subtitle: data.notes,
      status: "draft",
      amount: total,
      currency: record.currency ?? "INR",
      ownerId: access.user.uid,
      createdBy: access.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    history(
      db,
      batch,
      companyId,
      access,
      recordId,
      "quotation_created",
      { quotationId: { from: null, to: ref.id } },
      `Quotation total: ${total}`,
    );
    await batch.commit();
    return NextResponse.json(
      { quotation: plainDoc(await ref.get()) },
      { status: 201 },
    );
  } catch (e) {
    return crmError(e);
  }
}
