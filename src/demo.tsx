// Dev-only preview with fake data: npm run dev, then open /demo.html?tab=home
import { createRoot } from 'react-dom/client';
import { Shell } from './App';
import { Ctx, Store } from './lib/store';
import { addDays, today } from './lib/date';
import { defaultPlan } from './lib/defaultPlan';
import type { Checkin, Metric, SetLog } from './lib/types';
import './styles.css';

const t = today();
const plan = defaultPlan(addDays(t, -40));
const codes = plan.rotation;
const checkins: Checkin[] = [];
let k = 0;
for (let i = 1; i < 70; i++) {
  const day = addDays(t, -i);
  const r = (i * 7) % 10;
  if (r < 4) checkins.push({ id: i, day, status: 'done', workout_code: codes[k++ % 4], skip_reason: null, rating: 3 + (i % 3), energy: 2 + (i % 4), notes: null });
  else if (r === 5) checkins.push({ id: i, day, status: 'game', workout_code: null, skip_reason: null, rating: null, energy: null, notes: null });
  else if (r === 7) checkins.push({ id: i, day, status: 'skipped', workout_code: null, skip_reason: ['עייף', 'לא ישנתי מספיק', 'עבודה או לימודים'][i % 3], rating: null, energy: null, notes: null });
}
const sets: SetLog[] = [];
for (let i = 0; i < 10; i++) for (let s = 1; s <= 4; s++) sets.push({ id: i * 10 + s, day: addDays(t, -60 + i * 6), workout_code: 'LA', exercise: 'סקוואט עם מוט', set_no: s, weight: 60 + i * 2.5, reps: 5 });
const metrics: Metric[] = [
  { id: 1, day: addDays(t, -40), kind: 'vertical', value: 52 }, { id: 2, day: addDays(t, -12), kind: 'vertical', value: 55 },
  { id: 3, day: addDays(t, -40), kind: 'broad', value: 240 }, { id: 4, day: addDays(t, -40), kind: 'squat5', value: 70 },
  ...Array.from({ length: 10 }, (_, i) => ({ id: 10 + i, day: addDays(t, -10 + i), kind: 'sleep' as const, value: 6 + ((i * 3) % 5) / 4 })),
];
const noop = async () => {};
const store: Store = {
  profile: { tz: 'Asia/Jerusalem', ask_time: '18:30', review_time: '20:30', weekly_goal: 4, push_enabled: true },
  plan, checkins: checkins.sort((a, b) => b.day.localeCompare(a.day)), sets: sets.reverse(), metrics, memories: [{ id: 1, fact: 'משחק כדורסל בימי שלישי', created_at: '' }],
  messages: [
    { id: 1, role: 'assistant', content: 'הולך היום לחדר כושר? הבא בתור: Upper A · דחיפה.', kind: 'ask', created_at: new Date().toISOString() },
  ],
  reload: noop, upsertCheckin: noop, savePlan: noop, saveSets: noop, setMetric: noop, saveProfile: noop, addMemory: noop, deleteMemory: noop, sendChat: noop, sending: false, deleteCheckin: noop, note: noop,
};

createRoot(document.getElementById('root')!).render(<Ctx.Provider value={store}><Shell /></Ctx.Provider>);
