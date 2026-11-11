// Sends the daily questions as push notifications.
// Called every 10 minutes by pg_cron ({action:"tick"}); idempotent through notify_log.
// Also: {action:"vapid"} returns the public push key, {action:"test"} pushes a test to the caller.
import webpush from 'npm:web-push@3.6.7';
import { admin, caller, cors, json, localNow, nextWorkout, toMin } from '../_shared/util.ts';

const WINDOW = 50; // minutes after the set time in which a question may still go out

const pub = Deno.env.get('VAPID_PUBLIC_KEY');
const priv = Deno.env.get('VAPID_PRIVATE_KEY');
if (pub && priv) webpush.setVapidDetails('https://omrir17.github.io/lock-in/', pub, priv);

type DB = ReturnType<typeof admin>;

async function pushTo(db: DB, userId: string, payload: Record<string, string>) {
  const { data: subs } = await db.from('push_subs').select('*').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subs').delete().eq('id', s.id);
      else console.error('push failed', code, (e as Error).message);
    }
  }
  return sent;
}

async function claim(db: DB, userId: string, day: string, kind: string): Promise<boolean> {
  const { error } = await db.from('notify_log').insert({ user_id: userId, day, kind });
  return !error; // duplicate key → already sent
}

async function tick(db: DB) {
  const { data: profiles } = await db.from('profiles').select('*').eq('push_enabled', true);
  const out: string[] = [];
  for (const p of profiles ?? []) {
    const { day, minutes } = localNow(p.tz);
    const askAt = toMin(p.ask_time), reviewAt = toMin(p.review_time);
    const inAsk = minutes >= askAt && minutes < askAt + WINDOW;
    const inReview = minutes >= reviewAt && minutes < reviewAt + WINDOW;
    if (!inAsk && !inReview) continue;

    const { data: today } = await db.from('checkins').select('*').eq('user_id', p.user_id).eq('day', day).maybeSingle();

    if (inAsk && !today && await claim(db, p.user_id, day, 'ask')) {
      const [{ data: plan }, { data: recent }] = await Promise.all([
        db.from('plans').select('data').eq('user_id', p.user_id).maybeSingle(),
        db.from('checkins').select('day,status,workout_code').eq('user_id', p.user_id).order('day', { ascending: false }).limit(30),
      ]);
      const next = plan ? nextWorkout(plan.data, recent ?? [], day) : null;
      const text = `הולך היום לחדר כושר?${next ? ` הבא בתור: ${next.label}.` : ''}`;
      await db.from('messages').insert({ user_id: p.user_id, role: 'assistant', content: text, kind: 'ask' });
      await pushTo(db, p.user_id, { title: 'הולך היום?', body: next ? `הבא בתור: ${next.label}` : 'תענה בקצרה', url: './?tab=coach', tag: 'ask-' + day });
      out.push(`ask ${p.user_id}`);
    }

    if (inReview) {
      if (today?.status === 'going' && await claim(db, p.user_id, day, 'review')) {
        await db.from('messages').insert({ user_id: p.user_id, role: 'assistant', content: 'איך היה האימון?', kind: 'review' });
        await pushTo(db, p.user_id, { title: 'איך היה האימון?', body: 'דירוג, אנרגיה, ומה שבא לך להוסיף', url: './?tab=coach', tag: 'review-' + day });
        out.push(`review ${p.user_id}`);
      } else if (!today && await claim(db, p.user_id, day, 'ask_late')) {
        await db.from('messages').insert({ user_id: p.user_id, role: 'assistant', content: 'לא ענית היום. הלכת בסוף לאימון?', kind: 'ask_late' });
        await pushTo(db, p.user_id, { title: 'הלכת היום?', body: 'לא ענית בערב. דקה אחת לעדכן', url: './?tab=coach', tag: 'late-' + day });
        out.push(`late ${p.user_id}`);
      }
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body.action === 'vapid') return json({ publicKey: pub ?? null });

  if (body.action === 'test') {
    const user = await caller(req, db);
    if (!user) return json({ error: 'צריך להתחבר' }, 401);
    if (!pub || !priv) return json({ error: 'מפתחות ההתראות לא הוגדרו בשרת' }, 500);
    const sent = await pushTo(db, user.id, { title: 'Lock-in', body: 'ההתראות עובדות.', url: './', tag: 'test' });
    return json({ sent });
  }

  if (!pub || !priv) return json({ error: 'VAPID keys missing' }, 500);
  try {
    return json({ ok: true, sent: await tick(db) });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
