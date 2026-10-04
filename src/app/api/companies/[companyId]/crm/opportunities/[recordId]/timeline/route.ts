import { NextResponse } from "next/server";
import { z } from "zod";
import {
  crmError,
  opportunityAccess,
  history,
  plainDoc,
  notify,
  crmAllowed,
  readableHistory,
} from "@/lib/crm-server";
import { getAdmin } from "@/lib/firebase-admin";
type Context = { params: Promise<{ companyId: string; recordId: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const { companyId, recordId } = await params;
    const { access } = await opportunityAccess(companyId, recordId);
    const snap = await getAdmin()
      .db.collection(`companies/${companyId}/crmTimeline`)
      .where("entityId", "==", recordId)
      .get();
    return NextResponse.json({
      events: snap.docs
        .filter((d) => d.data().entityType === "opportunity")
        .map((d) => readableHistory(access, plainDoc(d)))
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))),
    });
  } catch (e) {
    return crmError(e);
  }
}
export async function POST(req: Request, { params }: Context) {
  try {
    const { companyId, recordId } = await params,
      { access, record } = await opportunityAccess(companyId, recordId, "edit");
    const data = z
      .object({
        body: z.string().trim().min(1).max(10000),
        eventType: z.literal("note").default("note"),
        mentionIds: z
          .array(z.string().regex(/^[^/]+$/))
          .max(20)
          .default([]),
      })
      .strict()
      .parse(await req.json());
    const db = getAdmin().db,
      batch = db.batch();
    for (const uid of data.mentionIds) {
      const member = await db
        .doc(`companies/${companyId}/members/${uid}`)
        .get();
      if (
        member.exists &&
        member.data()?.status === "active" &&
        crmAllowed(
          {
            ...access,
            user: { uid },
            membership: member.data() as typeof access.membership,
          },
          "opportunities",
          "view",
          record,
        )
      )
        notify(
          db,
          batch,
          companyId,
          uid,
          `You were mentioned in ${record.name}`,
          recordId,
        );
    }
    const ref = history(
      db,
      batch,
      companyId,
      access,
      recordId,
      "note",
      {},
      data.body,
    );
    await batch.commit();
    return NextResponse.json(
      { event: plainDoc(await ref.get()) },
      { status: 201 },
    );
  } catch (e) {
    return crmError(e);
  }
}
