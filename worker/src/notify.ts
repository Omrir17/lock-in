// The daily questions, sent as push notifications. Runs from the cron trigger every 10 minutes;
// notify_log makes it idempotent, so a question goes out at most once a day.
import { sendPush } from './webpush';
import { all, Env, first, localNow, nextWorkout, run, toMin } from './util';

const WINDOW = 50; // minutes after the set time in which a question may still go out
const SUBJECT = 'mailto:lock-in@users.noreply.github.com';

export async function pushTo(env: Env, uid: number, payload: Record<string, string>): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const subs = await all<{ id: number; endpoint: string; p256dh: string; auth: string }>(env.DB, 'select * from push_subs where user_id = ?', uid);
  let sent = 0;
  for (const s of subs) {
    try {
      const status = await sendPush(s, payload, { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: SUBJECT });
      if (status === 404 || status === 410) await run(env.DB, 'delete from push_subs where id = ?', s.id);
      else if (status >= 200 && status < 300) sent++;
      else console.error('push status', status);
    } catch (e) {
      console.error('push failed', (e as Error).message);
    }
  }
  return sent;
}

async function claim(db: D1Database, uid: number, day: string, kind: string): Promise<boolean> {
  const r = await run(db, 'insert or ignore into notify_log (user_id, day, kind) values (?, ?, ?)', uid, day, kind);
  return r.meta.changes > 0;
}

async function say(db: D1Database, uid: number, content: string, kind: string) {
  await run(db, "insert into messages (user_id, role, content, kind) values (?, 'assistant', ?, ?)", uid, content, kind);
}

export async function tick(env: Env): Promise<string[]> {
  const db = env.DB;
  const profiles = await all<{ user_id: number; tz: string; ask_time: string; review_time: string }>(db, 'select * from profiles where push_enabled = 1');
  const out: string[] = [];
  for (const p of profiles) {
    const { day, minutes } = localNow(p.tz);
    const askAt = toMin(p.ask_time), reviewAt = toMin(p.review_time);
    const inAsk = minutes >= askAt && minutes < askAt + WINDOW;
    const inReview = minutes >= reviewAt && minutes < reviewAt + WINDOW;
    if (!inAsk && !inReview) continue;

    const today = await first<{ status: string }>(db, 'select status from checkins where user_id = ? and day = ?', p.user_id, day);

    if (inAsk && !today && await claim(db, p.user_id, day, 'ask')) {
      const plan = await first<{ data: string }>(db, 'select data from plans where user_id = ?', p.user_id);
      const recent = await all<{ day: string; status: string; workout_code: string | null }>(db, 'select day, status, workout_code from checkins where user_id = ? order by day desc limit 30', p.user_id);
      const next = plan ? nextWorkout(JSON.parse(plan.data), recent, day) : null;
      await say(db, p.user_id, `הולך היום לחדר כושר?${next ? ` הבא בתור: ${next.label}.` : ''}`, 'ask');
      await pushTo(env, p.user_id, { title: 'הולך היום?', body: next ? `הבא בתור: ${next.label}` : 'תענה בקצרה', url: './?tab=coach', tag: 'ask-' + day });
      out.push('ask');
    }

    if (inReview) {
      if (today?.status === 'going' && await claim(db, p.user_id, day, 'review')) {
        await say(db, p.user_id, 'איך היה האימון?', 'review');
        await pushTo(env, p.user_id, { title: 'איך היה האימון?', body: 'דירוג, אנרגיה, ומה שבא לך להוסיף', url: './?tab=coach', tag: 'review-' + day });
        out.push('review');
      } else if (!today && await claim(db, p.user_id, day, 'ask_late')) {
        await say(db, p.user_id, 'לא ענית היום. הלכת בסוף לאימון?', 'ask_late');
        await pushTo(env, p.user_id, { title: 'הלכת היום?', body: 'לא ענית בערב. דקה אחת לעדכן', url: './?tab=coach', tag: 'late-' + day });
        out.push('late');
      }
    }
  }
  return out;
}
