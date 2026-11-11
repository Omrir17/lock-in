import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

/** The signed-in caller, or null. */
export async function caller(req: Request, db: SupabaseClient): Promise<User | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data.user ?? null;
}

/** This is a one-person app: the first account ever created is the owner. */
export async function isOwner(db: SupabaseClient, user: User): Promise<boolean> {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error || !data.users.length) return false;
  const first = data.users.reduce((a, b) => (a.created_at <= b.created_at ? a : b));
  return first.id === user.id;
}

export const TZ = 'Asia/Jerusalem';

export function localNow(tz = TZ): { day: string; minutes: number; dow: number } {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').map(Number);
  return { day, minutes: (h % 24) * 60 + m, dow: new Date(day + 'T12:00:00Z').getUTCDay() };
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

interface PlanLike {
  rotation: string[];
  workouts: { code: string; name: string; title: string }[];
}

export function nextWorkout(plan: PlanLike, checkins: { day: string; status: string; workout_code: string | null }[], before: string) {
  const last = checkins
    .filter((c) => (c.status === 'going' || c.status === 'done') && c.workout_code && c.day < before && plan.rotation.includes(c.workout_code))
    .sort((a, b) => b.day.localeCompare(a.day))[0];
  const code = last ? plan.rotation[(plan.rotation.indexOf(last.workout_code!) + 1) % plan.rotation.length] : plan.rotation[0];
  const w = plan.workouts.find((x) => x.code === code);
  return { code, label: w ? `${w.name} · ${w.title}` : code };
}
