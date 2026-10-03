import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  authorizeCompany,
  authorizationStatus,
  isCompanyAdministrator,
} from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { calendarEventUpdate } from "@/lib/calendar-model";
import { getAdmin } from "@/lib/firebase-admin";
import { z } from "zod";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ companyId: string; eventId: string }> },
) {
  const { companyId, eventId } = await params,
    auth = await authorizeCompany(companyId, { module: "calendar" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  try {
    const input = calendarEventUpdate.parse(await req.json()),
      db = getAdmin().db,
      ref = db.doc(`companies/${companyId}/calendarEvents/${eventId}`),
      doc = await ref.get();
    if (!doc.exists)
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (
      doc.data()?.creatorId !== auth.access.user.uid &&
      !isCompanyAdministrator(auth.access.membership)
    )
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const update: Record<string, unknown> = {
      ...input,
      updatedBy: auth.access.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.start) {
      update.start = Timestamp.fromDate(new Date(input.start));
      update.date = input.start.slice(0, 10);
    }
    if (input.end) update.end = Timestamp.fromDate(new Date(input.end));
    const batch = db.batch();
    batch.update(ref, update);
    appendAudit(
      db,
      companyId,
      {
        actorId: auth.access.user.uid,
        action: "calendar.event_updated",
        entityType: "calendar_event",
        entityId: eventId,
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid event update"
            : "Could not update event",
      },
      { status: 400 },
    );
  }
}
