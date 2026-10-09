import { describe, expect, it } from "vitest";
import {
  canSetCalendarVisibility,
  canViewCalendarEvent,
} from "./calendar-visibility";

describe("calendar visibility", () => {
  it("shows public and legacy events to every member", () => {
    expect(canViewCalendarEvent(false, { visibility: "everyone" })).toBe(true);
    expect(canViewCalendarEvent(false, {})).toBe(true);
  });

  it("shows admin-only events only to administrators", () => {
    expect(canViewCalendarEvent(false, { visibility: "admins" })).toBe(false);
    expect(canViewCalendarEvent(true, { visibility: "admins" })).toBe(true);
    expect(canSetCalendarVisibility(false, "admins")).toBe(false);
    expect(canSetCalendarVisibility(true, "admins")).toBe(true);
  });
});
