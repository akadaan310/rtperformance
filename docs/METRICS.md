# Metric definitions

All metrics are deterministic functions in `src/lib/metrics/index.ts` (unit-tested in `tests/unit/metrics.test.ts`).
No AI is involved in calculating them. "Today" is the business date in `America/New_York`.

| Metric | Definition |
|---|---|
| **Attendance** | Completed scheduled sessions ÷ (completed + missed). Sessions excused by the coach are excluded; a session dated today is still open and never counts as missed; future sessions are ignored. `null` (shown as "—") when nothing was due. |
| **Missed session** | A `planned` scheduled session dated before today without a completed workout. Never stored — always derived. |
| **Program adherence** | Over completed workouts that came from the schedule: Σ min(completed sets, prescribed sets) ÷ Σ prescribed sets. Independent of attendance — an athlete can attend every session and still skip prescribed work. |
| **Session completion** | Workouts marked complete ÷ workouts started in the range. |
| **Estimated 1RM** | Epley: weight × (1 + reps / 30) for completed sets of 1–12 reps; a single = its weight. Higher-rep sets don't produce an estimate. kg → lb (× 2.2046). |
| **Personal records** | Per exercise: best estimated 1RM, heaviest completed set, most reps in a set, longest duration, farthest distance — each with the date achieved. Dashboard highlights count a record only when the exercise had earlier history (a first log is a baseline). |
| **Volume** | Σ weight × reps over completed, loaded sets, in lb. Bodyweight, timed and distance work are excluded rather than estimated. |
| **Consistency** | Completed workouts per ISO week (Mon–Sun). Streak = consecutive weeks with ≥ 1 completed workout counting back from now; the current week can't break it. |
| **Goal progress** | (current − baseline) ÷ (target − baseline), clamped to 0–100 %. Current value: best e1RM / heaviest set / most reps (strength goals), 4-week average workouts per week (consistency), or the reported value (custom goals). |
| **Needs attention** | ≥ 2 missed sessions in the last 14 days; no completed workout for ≥ 10 days while on an active schedule; two consecutive self-reported recovery ratings ≤ 2/5. Prompts to check in — not assessments. |

What is deliberately **not** inferred: body composition, injury risk, physiological recovery, or anything from data the
athlete didn't record. Self-reported effort (RPE) and recovery are displayed as reported.
