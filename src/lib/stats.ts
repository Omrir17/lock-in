import { addDays, diffDays, today, weekStart } from './date';
import type { Checkin, Plan, SetLog } from './types';

export const isGym = (c: Checkin) => c.status === 'going' || c.status === 'done';

/** The workout after the last one trained (or planned). */
export function nextWorkout(plan: Plan, checkins: Checkin[], before = today()): string {
  const last = checkins.find((c) => isGym(c) && c.workout_code && c.day < before && plan.rotation.includes(c.workout_code));
  if (!last) return plan.rotation[0];
  const i = plan.rotation.indexOf(last.workout_code!);
  return plan.rotation[(i + 1) % plan.rotation.length];
}

export function weekNumber(plan: Plan, day = today()): number {
  return Math.max(1, Math.floor(diffDays(day, plan.startDate) / 7) + 1);
}

export function currentPhase(plan: Plan, day = today()) {
  const w = weekNumber(plan, day);
  const cycle = Math.max(...plan.phases.map((p) => p.toWeek));
  const inCycle = ((w - 1) % cycle) + 1;
  return { week: w, inCycle, cycle: Math.floor((w - 1) / cycle) + 1, phase: plan.phases.find((p) => inCycle >= p.fromWeek && inCycle <= p.toWeek) ?? plan.phases[0] };
}

export interface WeekRow { start: string; gym: number; games: number; skipped: number }

/** Last n weeks, oldest first, Sunday-based. */
export function weeks(checkins: Checkin[], n: number): WeekRow[] {
  const cur = weekStart(today());
  const rows: WeekRow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(cur, -7 * i);
    const end = addDays(start, 7);
    const inWeek = checkins.filter((c) => c.day >= start && c.day < end);
    rows.push({
      start,
      gym: inWeek.filter(isGym).length,
      games: inWeek.filter((c) => c.status === 'game').length,
      skipped: inWeek.filter((c) => c.status === 'skipped').length,
    });
  }
  return rows;
}

/** Full weeks in a row (before this one) with at least `min` gym sessions. */
export function weekStreak(checkins: Checkin[], min: number): number {
  const ws = weeks(checkins, 52).slice(0, -1).reverse();
  let n = 0;
  for (const w of ws) { if (w.gym >= min) n++; else break; }
  // this week counts once it already reached the minimum
  const thisWeek = weeks(checkins, 1)[0];
  return n + (thisWeek.gym >= min ? 1 : 0);
}

export function skipReasons(checkins: Checkin[], sinceDay: string): { reason: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of checkins) {
    if (c.status !== 'skipped' || c.day < sinceDay) continue;
    const r = (c.skip_reason || 'בלי סיבה').trim();
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

/** Heaviest set per day for one exercise, oldest first. */
export function topSets(sets: SetLog[], exercise: string): { day: string; weight: number; reps: number }[] {
  const byDay = new Map<string, { weight: number; reps: number }>();
  for (const s of sets) {
    if (s.exercise !== exercise || s.weight == null) continue;
    const cur = byDay.get(s.day);
    if (!cur || s.weight > cur.weight || (s.weight === cur.weight && (s.reps ?? 0) > cur.reps)) byDay.set(s.day, { weight: s.weight, reps: s.reps ?? 0 });
  }
  return [...byDay.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
}

/** The last logged sets of an exercise, to prefill the next session. */
export function lastSets(sets: SetLog[], exercise: string): SetLog[] {
  const last = sets.find((s) => s.exercise === exercise);
  if (!last) return [];
  return sets.filter((s) => s.exercise === exercise && s.day === last.day).sort((a, b) => a.set_no - b.set_no);
}

export function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
