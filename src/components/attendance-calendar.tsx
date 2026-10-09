"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ATTENDANCE_REQUIRED_MINUTES } from "@/lib/attendance";

type AttendanceRecord = {
  id: string;
  userId: string;
  date: string;
  activeSeconds?: number;
  present?: boolean;
};
type Member = { id: string; displayName: string; departmentIds?: string[] };
type Department = { id: string; name: string; workDays?: number[] };
type Data = { records: AttendanceRecord[]; members: Member[]; departments: Department[] };

const key = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function AttendanceCalendar({
  companyId,
  initialMonth,
  initialData,
}: {
  companyId: string;
  initialMonth: string;
  initialData: Data;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState(key(new Date()));
  const [loading, setLoading] = useState(false);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(year, monthNumber - 1, 1);
  const days = useMemo(() => {
    const leading = new Date(year, monthNumber - 1, 1).getDay();
    const total = new Date(year, monthNumber, 0).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: total }, (_, index) => new Date(year, monthNumber - 1, index + 1)),
    ];
  }, [monthNumber, year]);
  const departments = new Map(data.departments.map((department) => [department.id, department]));
  const records = new Map(data.records.map((record) => [`${record.date}_${record.userId}`, record]));
  const today = key(new Date());

  const scheduled = (member: Member, date: Date) => {
    const department = departments.get(member.departmentIds?.[0] ?? "");
    return (department?.workDays ?? [1, 2, 3, 4, 5, 6]).includes(date.getDay());
  };

  async function moveMonth(offset: number) {
    const target = new Date(year, monthNumber - 1 + offset, 1);
    const next = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
    setLoading(true);
    const response = await fetch(`/api/companies/${companyId}/attendance?month=${next}`);
    const result = await response.json();
    if (response.ok) {
      setMonth(next);
      setData(result);
      setSelected(`${next}-01`);
    }
    setLoading(false);
  }

  const selectedDate = new Date(`${selected}T12:00:00`);
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-[var(--border)] p-5">
        <div>
          <h2 className="font-bold">Attendance</h2>
          <p className="mt-1 text-xs muted">
            {ATTENDANCE_REQUIRED_MINUTES} active minutes marks attendance
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-lg p-2 hover:bg-[var(--soft)]" disabled={loading} onClick={() => void moveMonth(-1)}>
            <ChevronLeft size={16} />
          </button>
          <b className="min-w-28 text-center text-sm">
            {monthDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </b>
          <button className="rounded-lg p-2 hover:bg-[var(--soft)]" disabled={loading} onClick={() => void moveMonth(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </header>
      <div className="p-4">
        <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide muted">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span className="py-2" key={day}>{day}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((date, index) => {
            if (!date) return <span key={`empty-${index}`} />;
            const dateKey = key(date);
            const expected = data.members.filter((member) => scheduled(member, date));
            const present = expected.filter((member) => records.get(`${dateKey}_${member.id}`)?.present).length;
            return (
              <button
                className={`min-h-12 rounded-lg border p-1 text-left text-xs ${selected === dateKey ? "border-[var(--accent)] bg-orange-500/10" : "border-transparent hover:bg-[var(--soft)]"}`}
                key={dateKey}
                onClick={() => setSelected(dateKey)}
              >
                <span className="font-semibold">{date.getDate()}</span>
                {expected.length > 0 && dateKey <= today && (
                  <span className={`mt-1 block text-[9px] ${present === expected.length ? "text-emerald-500" : dateKey < today ? "text-red-500" : "text-amber-500"}`}>
                    {present}/{expected.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
        {data.members.map((member) => {
          const record = records.get(`${selected}_${member.id}`);
          const isScheduled = scheduled(member, selectedDate);
          const future = selected > today;
          const status = !isScheduled
            ? "Off day"
            : record?.present
              ? "Present"
              : future
                ? "Scheduled"
                : record?.activeSeconds
                  ? `${Math.floor(record.activeSeconds / 60)} / ${ATTENDANCE_REQUIRED_MINUTES} min`
                  : selected < today
                    ? "Absent"
                    : "Pending";
          const department = departments.get(member.departmentIds?.[0] ?? "")?.name ?? "No department";
          return (
            <div className="flex items-center justify-between gap-3 px-4 py-3" key={member.id}>
              <div className="min-w-0">
                <b className="block truncate text-sm">{member.displayName}</b>
                <small className="muted">{department}</small>
              </div>
              <span className={`shrink-0 text-xs font-semibold ${status === "Present" ? "text-emerald-500" : status === "Absent" ? "text-red-500" : "muted"}`}>
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
