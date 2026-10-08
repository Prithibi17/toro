import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, FolderKanban } from "lucide-react";
import { authorizeCompanyPage } from "@/lib/authorization";
import { getAdmin } from "@/lib/firebase-admin";
import { AttendanceCalendar } from "@/components/attendance-calendar";

type RecordData = FirebaseFirestore.DocumentData & { id: string };

const toDate = (value: unknown) => {
  if (value && typeof value === "object" && "toDate" in value)
    return (value as { toDate(): Date }).toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const dayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const friendlyAction = (action: unknown) =>
  String(action ?? "Workspace updated")
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

export default async function Dashboard({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const auth = await authorizeCompanyPage(companyId);
  if (!auth.ok) notFound();

  const db = getAdmin().db;
  const currentMonth = dayKey(new Date()).slice(0, 7);
  const [taskSnap, calendarSnap, opportunitySnap, auditSnap, memberSnap, departmentSnap, attendanceSnap] =
    await Promise.all([
      db.collection(`companies/${companyId}/tasks`).limit(300).get(),
      db.collection(`companies/${companyId}/calendarEvents`).limit(300).get(),
      db.collection(`companies/${companyId}/crmOpportunities`).limit(300).get(),
      db
        .collection(`companies/${companyId}/auditLogs`)
        .orderBy("timestamp", "desc")
        .limit(12)
        .get(),
      db.collection(`companies/${companyId}/members`).limit(300).get(),
      db.collection(`companies/${companyId}/departments`).get(),
      db
        .collection(`companies/${companyId}/attendance`)
        .where("date", ">=", `${currentMonth}-01`)
        .where("date", "<=", `${currentMonth}-31`)
        .get(),
    ]);

  const tasks: RecordData[] = taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const events: RecordData[] = calendarSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const opportunities: RecordData[] = opportunitySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const audits: RecordData[] = auditSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const memberNames = new Map(
    memberSnap.docs.map((doc) => [
      doc.id,
      String(doc.data().displayName ?? doc.data().email ?? "Former member"),
    ]),
  );

  const now = new Date();
  const today = dayKey(now);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = dayKey(weekEnd);
  const activeTasks = tasks.filter(
    (task) => !task.archivedAt && !task.completedAt && task.status !== "done",
  );
  const dueThisWeek = activeTasks.filter((task) => {
    const dueDate = String(task.dueDate ?? "").slice(0, 10);
    return dueDate >= today && dueDate <= weekEndKey;
  });
  const upcomingMeetings = events
    .map((event) => ({
      ...event,
      startDate:
        toDate(event.start) ??
        (event.date ? toDate(`${String(event.date)}T09:00:00`) : null),
    }))
    .filter(
      (event): event is RecordData & { startDate: Date } =>
        Boolean(event.startDate && event.startDate >= now),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const activeProjects = opportunities.filter(
    (opportunity) =>
      !opportunity.archivedAt &&
      !["won", "lost", "cancelled"].includes(
        String(opportunity.status ?? "open").toLowerCase(),
      ),
  );
  const recentActivity = audits
    .map((audit) => ({ ...audit, date: toDate(audit.timestamp) }))
    .filter((audit): audit is RecordData & { date: Date } => Boolean(audit.date))
    .slice(0, 8);

  const metrics = [
    {
      title: "Open To-Dos",
      value: activeTasks.length,
      detail: `${activeTasks.filter((task) => {
        const dueDate = String(task.dueDate ?? "").slice(0, 10);
        return Boolean(dueDate && dueDate < today);
      }).length} overdue`,
      icon: CheckCircle2,
      href: `/workspace/${companyId}/todo`,
    },
    {
      title: "Due this week",
      value: dueThisWeek.length,
      detail: "Next 7 days",
      icon: Clock3,
      href: `/workspace/${companyId}/todo`,
    },
    {
      title: "Upcoming meetings",
      value: upcomingMeetings.length,
      detail: upcomingMeetings[0]
        ? `Next ${formatDateTime(upcomingMeetings[0].startDate)}`
        : "Nothing scheduled",
      icon: CalendarDays,
      href: `/workspace/${companyId}/calendar`,
    },
    {
      title: "Active projects",
      value: activeProjects.length,
      detail: "Open CRM opportunities",
      icon: FolderKanban,
      href: `/workspace/${companyId}/crm`,
    },
  ];

  return (
    <>
      <header className="mb-8">
        <p className="text-sm font-semibold text-[var(--accent)]">Workspace overview</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Company overview</h1>
        <p className="mt-2 muted">
          Live work, deadlines, meetings, and activity across the workspace.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ title, value, detail, icon: Icon, href }) => (
          <Link
            className="panel p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
            href={href}
            key={title}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm muted">{title}</span>
              <span className="rounded-lg bg-[var(--soft)] p-2"><Icon size={18} /></span>
            </div>
            <p className="mt-5 text-3xl font-extrabold">{value}</p>
            <p className="mt-1 text-xs muted">{detail}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel overflow-hidden">
          <header className="border-b border-[var(--border)] p-5">
            <h2 className="font-bold">Recent activity</h2>
            <p className="mt-1 text-xs muted">Latest workspace changes</p>
          </header>
          <div className="divide-y divide-[var(--border)]">
            {recentActivity.map((activity) => (
              <div className="flex items-start gap-3 p-4" key={activity.id}>
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--soft)] text-xs font-bold">
                  {(memberNames.get(String(activity.actorId ?? "")) ?? "S").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{friendlyAction(activity.action)}</p>
                  <p className="mt-1 truncate text-xs muted">
                    {memberNames.get(String(activity.actorId ?? "")) ?? "System"}
                    {activity.entityType ? ` · ${String(activity.entityType).replaceAll("_", " ")}` : ""}
                  </p>
                </div>
                <time className="shrink-0 text-xs muted">{formatDateTime(activity.date)}</time>
              </div>
            ))}
            {!recentActivity.length && (
              <div className="grid min-h-56 place-items-center p-8 text-center">
                <div>
                  <Clock3 className="mx-auto mb-3 muted" />
                  <p className="font-semibold">No activity recorded yet</p>
                  <p className="mt-1 text-sm muted">Workspace changes will appear here automatically.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <AttendanceCalendar
          companyId={companyId}
          initialMonth={currentMonth}
          initialData={{
            records: attendanceSnap.docs.map((doc) => ({
              id: doc.id,
              userId: String(doc.data().userId),
              date: String(doc.data().date),
              activeSeconds: Number(doc.data().activeSeconds ?? 0),
              present: Boolean(doc.data().present),
            })),
            members: memberSnap.docs
              .filter((doc) => doc.data().status === "active")
              .map((doc) => ({
                id: doc.id,
                displayName: String(doc.data().displayName ?? doc.data().email ?? "Member"),
                departmentIds: doc.data().departmentIds ?? [],
              })),
            departments: departmentSnap.docs.map((doc) => ({
              id: doc.id,
              name: String(doc.data().name ?? "Department"),
              workDays: doc.data().workDays ?? [1, 2, 3, 4, 5, 6],
            })),
          }}
        />
      </div>
    </>
  );
}
