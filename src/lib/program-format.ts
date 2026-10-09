/** Pure helpers shared by the program builder, previews and The Tech Guy's program cards. */
export interface ProgramCardSession {
  name: string;
  week: number;
  day: number;
  focus: string | null;
  notes?: string | null;
  exercises: { name: string; sets: number; reps: string; load: string | null; rest: number | null; tempo: string | null; rpe?: number | null; block?: string | null; progression?: string | null; notes?: string | null }[];
}

export function describeLoad(type: string, value: number | null, unit: string | null): string | null {
  switch (type) {
    case "weight":
      return value !== null ? `${Number(value)} ${unit ?? "lb"}` : null;
    case "percent_1rm":
      return value !== null ? `${Number(value)}% 1RM` : null;
    case "rpe":
      return value !== null ? `RPE ${Number(value)}` : null;
    case "bodyweight":
      return "Bodyweight";
    default:
      return null;
  }
}

export function formatRest(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface SessionLike {
  name: string;
  week_number: number;
  day_number: number;
  focus: string | null;
  notes?: string | null;
  exercises: {
    sets: number;
    reps: string;
    load_type: string;
    load_value: number | null;
    load_unit: string | null;
    rest_seconds: number | null;
    tempo: string | null;
    rpe_target?: number | null;
    block_label?: string | null;
    progression?: string | null;
    notes?: string | null;
    exercise: { name: string };
  }[];
}

export function toCardSessions(sessions: SessionLike[]): ProgramCardSession[] {
  return sessions.map((s) => ({
    name: s.name,
    week: s.week_number,
    day: s.day_number,
    focus: s.focus,
    notes: s.notes ?? null,
    exercises: s.exercises.map((e) => ({
      name: e.exercise.name,
      sets: e.sets,
      reps: e.reps,
      load: describeLoad(e.load_type, e.load_value, e.load_unit),
      rest: e.rest_seconds,
      tempo: e.tempo,
      rpe: e.rpe_target ?? null,
      block: e.block_label ?? null,
      progression: e.progression ?? null,
      notes: e.notes ?? null,
    })),
  }));
}
