import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { today } from './date';
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
  deleteCheckin: (day: string) => Promise<void>;
  savePlan: (plan: Plan, note?: string) => Promise<void>;
  note: (content: string) => Promise<void>;
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

async function fetchParts(parts: (keyof Data)[]): Promise<Partial<Data>> {
  const got = await api<Partial<Data>>('data?parts=' + parts.join(','));
  if (parts.includes('profile') && !got.profile) got.profile = DEFAULT_PROFILE;
  if (parts.includes('plan') && !got.plan) {
    const plan = defaultPlan(today());
    await api('plan', { method: 'PUT', body: { plan, note: 'תוכנית התחלתית' } });
    got.plan = plan;
  }
  return got;
}

const ALL: (keyof Data)[] = ['profile', 'plan', 'checkins', 'sets', 'metrics', 'messages', 'memories'];

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const reload = useCallback(async (what: (keyof Data)[] = ALL) => {
    const got = await fetchParts(what);
    setData((d) => ({ ...(d as Data), ...got }));
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
      const { id: _id, day: _d, ...rest } = patch;
      await api('checkins/' + day, { method: 'PUT', body: rest });
      await reload(['checkins']);
    },
    async deleteCheckin(day) {
      await api('checkins/' + day, { method: 'DELETE' });
      await reload(['checkins']);
    },
    async savePlan(plan, note) {
      await api('plan', { method: 'PUT', body: { plan, note } });
      setData((d) => d && { ...d, plan });
    },
    async saveSets(day, workout, rows) {
      await api(`sets/${day}/${workout}`, { method: 'PUT', body: { rows } });
      await reload(['sets', 'checkins']);
    },
    async setMetric(day, kind, value) {
      await api('metrics', { method: 'PUT', body: { day, kind, value } });
      await reload(['metrics']);
    },
    async saveProfile(patch) {
      await api('profile', { method: 'PATCH', body: patch });
      setData((d) => d && { ...d, profile: { ...d.profile, ...patch } });
    },
    async addMemory(fact) {
      await api('memories', { body: { fact } });
      await reload(['memories']);
    },
    async deleteMemory(id) {
      await api('memories/' + id, { method: 'DELETE' });
      await reload(['memories']);
    },
    async note(content) {
      await api('messages', { body: { content } });
      await reload(['messages']);
    },
    async sendChat(text) {
      setSending(true);
      const optimistic: Message = { id: -Date.now(), role: 'user', content: text, kind: 'chat', created_at: new Date().toISOString() };
      setData((d) => d && { ...d, messages: [...d.messages, optimistic] });
      try {
        const res = await api<{ changed?: string[] }>('coach', { body: { message: text } });
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

