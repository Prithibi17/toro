import { describe, expect, it } from "vitest";
import {
  calendarDateTimeInput,
  calendarDateTimeRange,
} from "./calendar-datetime";

describe("calendar date and time inputs", () => {
  it("formats a local date for a datetime-local control", () => {
    expect(calendarDateTimeInput(new Date(2026, 9, 9, 9, 5))).toBe(
      "2026-10-09T09:05",
    );
  });

  it("accepts a chosen range and rejects an invalid range", () => {
    const range = calendarDateTimeRange(
      "2026-10-09T09:00",
      "2026-10-09T10:30",
    );
    expect(new Date(range.end).getTime() - new Date(range.start).getTime()).toBe(
      90 * 60 * 1000,
    );
    expect(() =>
      calendarDateTimeRange("2026-10-09T10:00", "2026-10-09T09:00"),
    ).toThrow("after the start");
  });
});
