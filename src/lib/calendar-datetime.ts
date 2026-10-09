const two = (value: number) => String(value).padStart(2, "0");

export function calendarDateTimeInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function calendarDateTimeIso(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid date and time");
  return date.toISOString();
}

export function calendarDateTimeRange(start: unknown, end: unknown) {
  const startIso = calendarDateTimeIso(start);
  const endIso = calendarDateTimeIso(end);
  if (new Date(endIso) <= new Date(startIso))
    throw new Error("End date and time must be after the start");
  return { start: startIso, end: endIso };
}
