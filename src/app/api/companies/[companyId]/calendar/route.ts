import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { appendAudit } from "@/lib/audit";
import { calendarEventInput } from "@/lib/calendar-model";
import { getAdmin } from "@/lib/firebase-admin";
import { z } from "zod";
const iso = (v: unknown) =>
  v && typeof v === "object" && "toDate" in v
    ? (v as { toDate(): Date }).toDate().toISOString()
    : v;
export async function GET(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    auth = await authorizeCompany(companyId, { module: "calendar" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  const u = new URL(req.url),
    from = new Date(u.searchParams.get("from") || Date.now() - 31 * 86400000),
    to = new Date(u.searchParams.get("to") || Date.now() + 62 * 86400000),
    snap = await getAdmin()
      .db.collection(`companies/${companyId}/calendarEvents`)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
  return NextResponse.json({
    events: snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
        start:
          iso(d.data().start) ??
          (d.data().date ? `${d.data().date}T09:00:00.000Z` : null),
        end:
          iso(d.data().end) ??
          (d.data().date ? `${d.data().date}T10:00:00.000Z` : null),
      }))
      .filter(
        (e) =>
          e.start &&
          new Date(String(e.start)) < to &&
          new Date(String(e.end)) > from,
      ),
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params,
    auth = await authorizeCompany(companyId, { module: "calendar" });
  if (!auth.ok)
    return NextResponse.json(
      { error: "Access denied" },
      { status: authorizationStatus(auth.reason) },
    );
  try {
    const input = calendarEventInput.parse(await req.json()),
      db = getAdmin().db,
      ref = db.collection(`companies/${companyId}/calendarEvents`).doc(),
      batch = db.batch();
    batch.create(ref, {
      ...input,
      start: Timestamp.fromDate(new Date(input.start)),
      end: Timestamp.fromDate(new Date(input.end)),
      date: input.start.slice(0, 10),
      companyId,
      ownerId: auth.access.user.uid,
      organizerId: auth.access.user.uid,
      creatorId: auth.access.user.uid,
      createdBy: auth.access.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedBy: auth.access.user.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    appendAudit(
      db,
      companyId,
      {
        actorId: auth.access.user.uid,
        action: "calendar.event_created",
        entityType: "calendar_event",
        entityId: ref.id,
      },
      batch,
    );
    await batch.commit();
    return NextResponse.json(
      {
        event: {
          id: ref.id,
          ...input,
          creatorId: auth.access.user.uid,
          ownerId: auth.access.user.uid,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid event information"
            : "Could not create event",
      },
      { status: 400 },
    );
  }
}
