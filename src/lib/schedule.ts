/**
 * Assignment schedule rule (mirrors public.assign_program in SQL, used for previews):
 * training days are ordered by how many days they fall after the start date; within each program week,
 * the k-th session (ordered by day number, then position) lands on the k-th of those days. If a week has
 * more sessions than training days, the extra sessions roll into the following calendar week(s).
 */
import { addDays } from "@/lib/metrics";

export interface ScheduleSessionInput {
  id: string;
  week_number: number;
  day_number: number;
  position: number;
}

export function isoWeekday(dateKey: string): number {
  const d = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function buildSchedule(sessions: ScheduleSessionInput[], startDate: string, trainingDays: number[]) {
  const dow = isoWeekday(startDate);
  const offsets = [...new Set(trainingDays)].map((d) => (d - dow + 7) % 7).sort((a, b) => a - b);
  if (offsets.length === 0) return [];
  const byWeek = new Map<number, ScheduleSessionInput[]>();
  for (const s of sessions) byWeek.set(s.week_number, [...(byWeek.get(s.week_number) ?? []), s]);
  const out: { session_id: string; date: string; week_number: number }[] = [];
  for (const [week, list] of byWeek) {
    list
      .sort((a, b) => a.day_number - b.day_number || a.position - b.position)
      .forEach((s, i) => {
        const offset = offsets[i % offsets.length]! + Math.floor(i / offsets.length) * 7;
        out.push({ session_id: s.id, date: addDays(startDate, (week - 1) * 7 + offset), week_number: week });
      });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const;
