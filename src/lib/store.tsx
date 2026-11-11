import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { sb } from './supabase';
import { addDays, today } from './date';
import { defaultPlan } from './defaultPlan';
import type { Checkin, Memory, Message, Metric, MetricKind, Plan, Profile, SetLog } from './types';

interface Data {
  profile: Profile;
  plan: Plan;
  checkins: Checkin[]; // newest first
  sets: SetLog[]; // newest first
  metrics: Metric[];
  messages: Message[]; // oldest first
  memories: Memory[];
}

interface Store extends Data {
  reload: (what?: (keyof Data)[]) => Promise<void>;
  upsertCheckin: (day: string, patch: Partial<Checkin>) => Promise<void>;
  savePlan: (plan: Plan) => Promise<void>;
  saveSets: (day: string, workout: string, rows: { exercise: string; set_no: number; weight: number | null; reps: number | null }[]) => Promise<void>;
  setMetric: (day: string, kind: MetricKind, value: number | null) => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  addMemory: (fact: string) => Promise<void>;
  deleteMemory: (id: number) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  sending: boolean;
}

export const Ctx = createContext<Store | null>(null);
export type { Store };
export const useStore = () => useContext(Ctx)!;

const DEFAULT_PROFILE: Profile = { tz: 'Asia/Jerusalem', ask_time: '18:30', review_time: '20:30', weekly_goal: 4, push_enabled: true };

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

async function fetchPart(k: keyof Data): Promise<Partial<Data>> {
  const since = addDays(today(), -400);
  switch (k) {
    case 'profile': {
      let p = must(await sb.from('profiles').select('tz,ask_time,review_time,weekly_goal,push_enabled').maybeSingle()) as Profile | null;
      if (!p) { must(await sb.from('profiles').insert({})); p = DEFAULT_PROFILE; }
      return { profile: { ...p, ask_time: p.ask_time.slice(0, 5), review_time: p.review_time.slice(0, 5) } };
    }
    case 'plan': {
      const row = must(await sb.from('plans').select('data').maybeSingle()) as { data: Plan } | null;
      if (row) return { plan: row.data as Plan };
      const plan = defaultPlan(today());
      must(await sb.from('plans').insert({ data: plan }));
      return { plan };
    }
    case 'checkins':
      return { checkins: must(await sb.from('checkins').select('*').gte('day', since).order('day', { ascending: false })) };
    case 'sets':
      return { sets: must(await sb.from('set_logs').select('*').gte('day', since).order('day', { ascending: false }).order('set_no')) };
    case 'metrics':
      return { metrics: must(await sb.from('metrics').select('*').order('day')) };
    case 'messages': {
      const m = must(await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(80));
      return { messages: (m as Message[]).reverse() };
    }
    case 'memories':
      return { memories: must(await sb.from('memories').select('*').order('created_at')) };
  }
}

const ALL: (keyof Data)[] = ['profile', 'plan', 'checkins', 'sets', 'metrics', 'messages', 'memories'];

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const reload = useCallback(async (what: (keyof Data)[] = ALL) => {
    // profile and plan first: they create the rows the rest depends on
    const first = what.filter((k) => k === 'profile' || k === 'plan');
    const rest = what.filter((k) => k !== 'profile' && k !== 'plan');
    const parts = [...(await Promise.all(first.map(fetchPart))), ...(await Promise.all(rest.map(fetchPart)))];
    setData((d) => Object.assign({}, d, ...parts));
  }, []);

  useEffect(() => { reload().catch((e) => setError(e.message)); }, [reload]);

  // Coming back to the app (e.g. from a notification): refresh the day.
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') reload(['checkins', 'messages']).catch(() => {}); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [reload]);

  if (error) return <div className="splash"><div className="logo">Lock-in</div><p>הנתונים לא נטענו: {error}</p><button className="btn" onClick={() => location.reload()}>לנסות שוב</button></div>;
  if (!data || !data.plan || !data.profile || !data.messages) return <div className="splash"><div className="logo">Lock-in</div></div>;

  const store: Store = {
    ...data,
    reload,
    sending,
    async upsertCheckin(day, patch) {
      const cur = data.checkins.find((c) => c.day === day);
      const row = { status: cur?.status ?? 'going', ...cur, ...patch, day };
      delete (row as Partial<Checkin>).id;
      must(await sb.from('checkins').upsert(row, { onConflict: 'user_id,day' }));
      await reload(['checkins']);
    },
    async savePlan(plan) {
      must(await sb.from('plans').update({ data: plan }).not('user_id', 'is', null));
      setData((d) => d && { ...d, plan });
    },
    async saveSets(day, workout, rows) {
      must(await sb.from('set_logs').delete().eq('day', day).eq('workout_code', workout));
      if (rows.length) must(await sb.from('set_logs').insert(rows.map((r) => ({ ...r, day, workout_code: workout }))));
      const cur = data.checkins.find((c) => c.day === day);
      if (!cur || cur.status === 'going' || cur.status === 'skipped') {
        must(await sb.from('checkins').upsert({ day, status: 'done', workout_code: workout, skip_reason: null }, { onConflict: 'user_id,day' }));
      }
      await reload(['sets', 'checkins']);
    },
    async setMetric(day, kind, value) {
      if (value == null) must(await sb.from('metrics').delete().eq('day', day).eq('kind', kind));
      else must(await sb.from('metrics').upsert({ day, kind, value }, { onConflict: 'user_id,day,kind' }));
      await reload(['metrics']);
    },
    async saveProfile(patch) {
      must(await sb.from('profiles').update(patch).not('user_id', 'is', null));
      setData((d) => d && { ...d, profile: { ...d.profile, ...patch } });
    },
    async addMemory(fact) {
      must(await sb.from('memories').insert({ fact }));
      await reload(['memories']);
    },
    async deleteMemory(id) {
      must(await sb.from('memories').delete().eq('id', id));
      await reload(['memories']);
    },
    async sendChat(text) {
      setSending(true);
      const optimistic: Message = { id: -Date.now(), role: 'user', content: text, kind: 'chat', created_at: new Date().toISOString() };
      setData((d) => d && { ...d, messages: [...d.messages, optimistic] });
      try {
        const { data: res, error } = await sb.functions.invoke('coach', { body: { message: text, today: today() } });
        if (error) throw new Error(await errorText(error));
        const changed: (keyof Data)[] = ['messages', ...((res?.changed ?? []) as (keyof Data)[])];
        await reload(changed);
      } catch (e) {
        const msg: Message = { id: -Date.now() - 1, role: 'assistant', content: `לא הצלחתי לענות: ${(e as Error).message}`, kind: 'chat', created_at: new Date().toISOString() };
        setData((d) => d && { ...d, messages: [...d.messages, msg] });
      } finally {
        setSending(false);
      }
    },
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

async function errorText(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try { const j = await ctx.json(); if (j?.error) return j.error; } catch { /* not json */ }
  }
  return (e as Error).message;
}
