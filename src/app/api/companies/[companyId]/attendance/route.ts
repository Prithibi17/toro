import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeCompany, authorizationStatus } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { attendancePresent } from "@/lib/attendance";

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6];
const weekdayNumbers: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function companyDay(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    weekday: weekdayNumbers[value.weekday] ?? now.getDay(),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId);
  if (!auth.ok)
    return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  const db = getAdmin().db;
  const [records, members, departments] = await Promise.all([
    db
      .collection(`companies/${companyId}/attendance`)
      .where("date", ">=", `${month}-01`)
      .where("date", "<=", `${month}-31`)
      .get(),
    db.collection(`companies/${companyId}/members`).where("status", "==", "active").get(),
    db.collection(`companies/${companyId}/departments`).get(),
  ]);
  return NextResponse.json({
    records: records.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        present: attendancePresent(
          Number(data.activeSeconds ?? 0),
          data.scheduled !== false,
        ),
      };
    }),
    members: members.docs.map((doc) => ({
      id: doc.id,
      displayName: doc.data().displayName ?? doc.data().email ?? "Member",
      departmentIds: doc.data().departmentIds ?? [],
    })),
    departments: departments.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name ?? "Department",
      workDays: doc.data().workDays ?? DEFAULT_WORK_DAYS,
    })),
  });
}

export async function POST(
  _: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await authorizeCompany(companyId);
  if (!auth.ok)
    return NextResponse.json({ error: "Access denied" }, { status: authorizationStatus(auth.reason) });
  if (auth.access.membership.userType === "portal")
    return NextResponse.json({ error: "Attendance is for employees" }, { status: 403 });

  const db = getAdmin().db;
  const company = await db.doc(`companies/${companyId}`).get();
  const timezone = String(company.data()?.timezone ?? "Asia/Kolkata");
  const now = new Date();
  const { date, weekday } = companyDay(now, timezone);
  const departmentId = auth.access.membership.departmentIds?.[0] ?? null;
  const department = departmentId
    ? await db.doc(`companies/${companyId}/departments/${departmentId}`).get()
    : null;
  const scheduled = (department?.data()?.workDays ?? DEFAULT_WORK_DAYS).includes(weekday);
  const ref = db.doc(`companies/${companyId}/attendance/${date}_${auth.access.user.uid}`);
  let activeSeconds = 0;
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const previous = existing.data()?.lastPingAt?.toDate?.() as Date | undefined;
    const elapsed = previous ? Math.floor((now.getTime() - previous.getTime()) / 1000) : 0;
    const earned = elapsed >= 30 && elapsed <= 120 ? Math.min(elapsed, 90) : 0;
    activeSeconds = Number(existing.data()?.activeSeconds ?? 0) + earned;
    transaction.set(
      ref,
      {
        companyId,
        userId: auth.access.user.uid,
        date,
        departmentId,
        scheduled,
        activeSeconds,
        present: attendancePresent(activeSeconds, scheduled),
        firstSeenAt: existing.data()?.firstSeenAt ?? FieldValue.serverTimestamp(),
        lastPingAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  return NextResponse.json({
    date,
    scheduled,
    activeSeconds,
    present: attendancePresent(activeSeconds, scheduled),
  });
}
