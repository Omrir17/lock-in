// One-person app: the first sign-up creates the only account; after that sign-up is closed.
import { b64url, unb64url } from './webpush';
import { all, first, HttpError, run } from './util';

const ITER = 20000; // keeps PBKDF2 inside the Workers Free CPU budget
const enc = new TextEncoder();

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return b64url(bits);
}

async function sha256(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function newSession(db: D1Database, uid: number): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await run(db, 'insert into sessions (token_hash, user_id) values (?, ?)', await sha256(token), uid);
  return token;
}

export async function hasUser(db: D1Database): Promise<boolean> {
  return !!(await first(db, 'select 1 from users limit 1'));
}

function check(email: unknown, password: unknown): { email: string; password: string } {
  const e = String(email ?? '').trim().toLowerCase();
  const p = String(password ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, 'כתובת האימייל לא תקינה.');
  if (p.length < 8) throw new HttpError(400, 'הסיסמה צריכה לפחות 8 תווים.');
  return { email: e, password: p };
}

export async function signup(db: D1Database, body: { email?: string; password?: string }) {
  const { email, password } = check(body.email, body.password);
  if (await hasUser(db)) throw new HttpError(403, 'כבר יש חשבון באפליקציה. אפשר רק להיכנס.');
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const res = await run(db, 'insert into users (email, pass_hash, salt) values (?, ?, ?)', email, await hashPassword(password, salt), b64url(salt));
  const uid = Number(res.meta.last_row_id);
  return { token: await newSession(db, uid) };
}

export async function login(db: D1Database, body: { email?: string; password?: string }) {
  const recent = await first<{ n: number }>(db, "select count(*) as n from login_failures where at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')");
  if ((recent?.n ?? 0) >= 8) throw new HttpError(429, 'יותר מדי ניסיונות. נסה שוב בעוד רבע שעה.');
  const email = String(body.email ?? '').trim().toLowerCase();
  const user = await first<{ id: number; pass_hash: string; salt: string }>(db, 'select id, pass_hash, salt from users where email = ?', email);
  const ok = user && timingSafeEqual(await hashPassword(String(body.password ?? ''), unb64url(user.salt)), user.pass_hash);
  if (!ok) {
    await run(db, 'insert into login_failures default values');
    throw new HttpError(401, 'האימייל או הסיסמה לא נכונים.');
  }
  await run(db, "delete from login_failures where at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')");
  return { token: await newSession(db, user.id) };
}

export async function logout(db: D1Database, req: Request) {
  const token = bearer(req);
  if (token) await run(db, 'delete from sessions where token_hash = ?', await sha256(token));
}

function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** The signed-in user's id, or throws 401. */
export async function requireUser(db: D1Database, req: Request): Promise<number> {
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'צריך להתחבר');
  const row = await first<{ user_id: number }>(db, 'select user_id from sessions where token_hash = ?', await sha256(token));
  if (!row) throw new HttpError(401, 'צריך להתחבר מחדש');
  return row.user_id;
}

export async function userIds(db: D1Database): Promise<number[]> {
  return (await all<{ id: number }>(db, 'select id from users')).map((r) => r.id);
}
