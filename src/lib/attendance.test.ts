import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_REQUIRED_SECONDS,
  attendancePresent,
} from "./attendance";

describe("attendance threshold", () => {
  it("marks attendance at exactly 15 active minutes", () => {
    expect(ATTENDANCE_REQUIRED_SECONDS).toBe(900);
    expect(attendancePresent(899)).toBe(false);
    expect(attendancePresent(900)).toBe(true);
  });

  it("does not mark attendance on an off day", () => {
    expect(attendancePresent(900, false)).toBe(false);
  });
});
