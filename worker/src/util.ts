export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_FALLBACK_MODEL?: string;
  OPENAI_BASE_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function all<T = Record<string, unknown>>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...args).all<T>()).results;
}

export async function first<T = Record<string, unknown>>(db: D1Database, sql: string, ...args: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...args).first<T>();
}

export async function run(db: D1Database, sql: string, ...args: unknown[]) {
  return db.prepare(sql).bind(...args).run();
}

export const TZ = 'Asia/Jerusalem';

export function localNow(tz = TZ, at = new Date()): { day: string; minutes: number; dow: number } {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(at).split(':').map(Number);
  return { day, minutes: (h % 24) * 60 + m, dow: new Date(day + 'T12:00:00Z').getUTCDay() };
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

interface PlanLike { rotation: string[]; workouts: { code: string; name: string; title: string }[] }

export function nextWorkout(plan: PlanLike, checkins: { day: string; status: string; workout_code: string | null }[], before: string) {
  const last = checkins
    .filter((c) => (c.status === 'going' || c.status === 'done') && c.workout_code && c.day < before && plan.rotation.includes(c.workout_code))
    .sort((a, b) => b.day.localeCompare(a.day))[0];
  const code = last ? plan.rotation[(plan.rotation.indexOf(last.workout_code!) + 1) % plan.rotation.length] : plan.rotation[0];
  const w = plan.workouts.find((x) => x.code === code);
  return { code, label: w ? `${w.name} · ${w.title}` : code };
}

/** Insert or merge a day's check-in. */
export async function upsertCheckin(db: D1Database, uid: number, day: string, patch: Record<string, unknown>) {
  const cur = await first<Record<string, unknown>>(db, 'select * from checkins where user_id = ? and day = ?', uid, day);
  const row = { status: 'going', workout_code: null, skip_reason: null, rating: null, energy: null, notes: null, ...(cur ?? {}), ...patch };
  if (!['going', 'game', 'skipped', 'done'].includes(String(row.status))) throw new HttpError(400, 'bad status');
  await run(db,
    `insert into checkins (user_id, day, status, workout_code, skip_reason, rating, energy, notes, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     on conflict (user_id, day) do update set status = excluded.status, workout_code = excluded.workout_code,
       skip_reason = excluded.skip_reason, rating = excluded.rating, energy = excluded.energy, notes = excluded.notes,
       updated_at = excluded.updated_at`,
    uid, day, row.status, row.workout_code ?? null, row.skip_reason ?? null, row.rating ?? null, row.energy ?? null, row.notes ?? null);
}

export async function savePlan(db: D1Database, uid: number, data: unknown, note: string | null = null) {
  const s = JSON.stringify(data);
  await db.batch([
    db.prepare(`insert into plans (user_id, data, updated_at) values (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`).bind(uid, s),
    db.prepare('insert into plan_versions (user_id, data, note) values (?, ?, ?)').bind(uid, s, note),
  ]);
}

export async function setMetric(db: D1Database, uid: number, day: string, kind: string, value: number | null) {
  if (value == null) await run(db, 'delete from metrics where user_id = ? and day = ? and kind = ?', uid, day, kind);
  else await run(db, `insert into metrics (user_id, day, kind, value) values (?, ?, ?, ?)
                      on conflict (user_id, day, kind) do update set value = excluded.value`, uid, day, kind, value);
}
