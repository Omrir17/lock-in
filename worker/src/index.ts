// Lock-in API (/api/*) + the static app, on one Cloudflare Worker with D1.
import { hasUser, login, logout, requireUser, signup } from './auth';
import { coach, validPlan } from './coach';
import { pushTo, tick } from './notify';
import { addDays, all, Env, first, HttpError, isDay, json, localNow, run, savePlan, setMetric, upsertCheckin } from './util';

type Body = Record<string, unknown>;

const PARTS = ['profile', 'plan', 'checkins', 'sets', 'metrics', 'messages', 'memories'] as const;

async function part(db: D1Database, uid: number, name: string): Promise<unknown> {
  const since = addDays(localNow().day, -400);
  switch (name) {
    case 'profile': {
      const p = await first<Record<string, unknown>>(db, 'select tz, ask_time, review_time, weekly_goal, push_enabled from profiles where user_id = ?', uid);
      return p && { ...p, push_enabled: !!p.push_enabled };
    }
    case 'plan': {
      const p = await first<{ data: string }>(db, 'select data from plans where user_id = ?', uid);
      return p ? JSON.parse(p.data) : null;
    }
    case 'checkins': return all(db, 'select * from checkins where user_id = ? and day >= ? order by day desc', uid, since);
    case 'sets': return all(db, 'select * from set_logs where user_id = ? and day >= ? order by day desc, set_no', uid, since);
    case 'metrics': return all(db, 'select * from metrics where user_id = ? order by day', uid);
    case 'messages': return (await all(db, 'select * from messages where user_id = ? order by id desc limit 80', uid)).reverse();
    case 'memories': return all(db, 'select * from memories where user_id = ? order by id', uid);
  }
  return null;
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const db = env.DB;
  const method = req.method;
  const body = async (): Promise<Body> => (await req.json().catch(() => ({}))) as Body;

  // ---- open routes
  if (path === '/api/auth/status' && method === 'GET') return json({ hasUser: await hasUser(db) });
  if (path === '/api/auth/signup' && method === 'POST') {
    const r = await signup(db, await body());
    const u = await first<{ id: number }>(db, 'select id from users limit 1');
    await run(db, 'insert or ignore into profiles (user_id) values (?)', u!.id);
    return json(r);
  }
  if (path === '/api/auth/login' && method === 'POST') return json(await login(db, await body()));
  if (path === '/api/push/key' && method === 'GET') return json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });

  // ---- signed-in routes
  const uid = await requireUser(db, req);
  if (path === '/api/auth/logout' && method === 'POST') { await logout(db, req); return json({ ok: true }); }

  if (path === '/api/data' && method === 'GET') {
    const want = (new URL(req.url).searchParams.get('parts') ?? PARTS.join(',')).split(',').filter((p) => (PARTS as readonly string[]).includes(p));
    const out: Record<string, unknown> = {};
    await Promise.all(want.map(async (p) => { out[p] = await part(db, uid, p); }));
    return json(out);
  }

  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/api\/checkins\/(\d{4}-\d{2}-\d{2})$/))) {
    if (method === 'PUT') { await upsertCheckin(db, uid, m[1], await body()); return json({ ok: true }); }
    if (method === 'DELETE') { await run(db, 'delete from checkins where user_id = ? and day = ?', uid, m[1]); return json({ ok: true }); }
  }

  if (path === '/api/plan' && method === 'PUT') {
    const b = await body();
    const bad = validPlan(b.plan);
    if (bad) throw new HttpError(400, bad);
    await savePlan(db, uid, b.plan, typeof b.note === 'string' ? b.note : null);
    return json({ ok: true });
  }
  if (path === '/api/plan/versions' && method === 'GET') {
    const rows = await all<{ id: number; data: string; note: string | null; created_at: string }>(db, 'select * from plan_versions where user_id = ? order by id desc limit 20', uid);
    return json(rows.map((r) => ({ ...r, data: JSON.parse(r.data) })));
  }

  if ((m = path.match(/^\/api\/sets\/(\d{4}-\d{2}-\d{2})\/([\w-]+)$/)) && method === 'PUT') {
    const [, day, code] = m;
    const rows = ((await body()).rows ?? []) as { exercise: string; set_no: number; weight: number | null; reps: number | null }[];
    const stmts = [db.prepare('delete from set_logs where user_id = ? and day = ? and workout_code = ?').bind(uid, day, code)];
    for (const r of rows.slice(0, 200)) {
      stmts.push(db.prepare('insert into set_logs (user_id, day, workout_code, exercise, set_no, weight, reps) values (?, ?, ?, ?, ?, ?, ?)')
        .bind(uid, day, code, String(r.exercise), Number(r.set_no), r.weight ?? null, r.reps ?? null));
    }
    await db.batch(stmts);
    const cur = await first<{ status: string }>(db, 'select status from checkins where user_id = ? and day = ?', uid, day);
    if (!cur || cur.status === 'going' || cur.status === 'skipped') await upsertCheckin(db, uid, day, { status: 'done', workout_code: code, skip_reason: null });
    return json({ ok: true });
  }

  if (path === '/api/metrics' && method === 'PUT') {
    const b = await body();
    if (!isDay(b.day) || typeof b.kind !== 'string') throw new HttpError(400, 'bad metric');
    await setMetric(db, uid, b.day, b.kind, typeof b.value === 'number' ? b.value : null);
    return json({ ok: true });
  }

  if (path === '/api/profile' && method === 'PATCH') {
    const b = await body();
    const sets: string[] = [], args: unknown[] = [];
    for (const k of ['ask_time', 'review_time'] as const) if (typeof b[k] === 'string' && /^\d{2}:\d{2}$/.test(b[k] as string)) { sets.push(`${k} = ?`); args.push(b[k]); }
    if (typeof b.weekly_goal === 'number') { sets.push('weekly_goal = ?'); args.push(Math.max(1, Math.min(7, Math.round(b.weekly_goal)))); }
    if (typeof b.push_enabled === 'boolean') { sets.push('push_enabled = ?'); args.push(b.push_enabled ? 1 : 0); }
    if (sets.length) {
      await run(db, 'insert or ignore into profiles (user_id) values (?)', uid);
      await run(db, `update profiles set ${sets.join(', ')} where user_id = ?`, ...args, uid);
    }
    return json({ ok: true });
  }

  if (path === '/api/memories' && method === 'POST') {
    const fact = String((await body()).fact ?? '').trim().slice(0, 500);
    if (fact) await run(db, 'insert into memories (user_id, fact) values (?, ?)', uid, fact);
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/memories\/(\d+)$/)) && method === 'DELETE') {
    await run(db, 'delete from memories where user_id = ? and id = ?', uid, Number(m[1]));
    return json({ ok: true });
  }

  if (path === '/api/messages' && method === 'POST') {
    const content = String((await body()).content ?? '').trim().slice(0, 2000);
    if (content) await run(db, "insert into messages (user_id, role, content) values (?, 'user', ?)", uid, content);
    return json({ ok: true });
  }
  if (path === '/api/coach' && method === 'POST') return json(await coach(env, uid, (await body()).message));

  if (path === '/api/push/subscribe' && method === 'POST') {
    const b = await body() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!b.endpoint || !b.keys?.p256dh || !b.keys.auth) throw new HttpError(400, 'bad subscription');
    await run(db, `insert into push_subs (user_id, endpoint, p256dh, auth) values (?, ?, ?, ?)
                   on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      uid, b.endpoint, b.keys.p256dh, b.keys.auth);
    return json({ ok: true });
  }
  if (path === '/api/push/unsubscribe' && method === 'POST') {
    await run(db, 'delete from push_subs where user_id = ? and endpoint = ?', uid, String((await body()).endpoint ?? ''));
    return json({ ok: true });
  }
  if (path === '/api/push/test' && method === 'POST') {
    if (!env.VAPID_PUBLIC_KEY) throw new HttpError(500, 'מפתחות ההתראות לא הוגדרו בשרת');
    return json({ sent: await pushTo(env, uid, { title: 'Lock-in', body: 'ההתראות עובדות.', url: './', tag: 'test' }) });
  }

  throw new HttpError(404, 'not found');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await api(req, env, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  },

  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(tick(env).then((r) => { if (r.length) console.log('sent', r); }));
  },
} satisfies ExportedHandler<Env>;
