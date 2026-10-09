export const ATTENDANCE_REQUIRED_MINUTES = 15;
export const ATTENDANCE_REQUIRED_SECONDS = ATTENDANCE_REQUIRED_MINUTES * 60;

export function attendancePresent(activeSeconds: number, scheduled = true) {
  return scheduled && activeSeconds >= ATTENDANCE_REQUIRED_SECONDS;
}
