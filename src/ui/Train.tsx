import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { today } from '../lib/date';
import { lastSets, nextWorkout } from '../lib/stats';
import type { Exercise } from '../lib/types';
import { CheckinCard } from './CheckinCard';

type Row = { weight: string; reps: string; done: boolean };
type Draft = Record<string, Row[]>;

const draftKey = (day: string, code: string) => `lockin-draft-${day}-${code}`;
function loadDraft(day: string, code: string): Draft | null {
  try { const v = localStorage.getItem(draftKey(day, code)); return v ? JSON.parse(v) : null; } catch { return null; }
}
function storeDraft(day: string, code: string, d: Draft | null) {
  try { if (d) localStorage.setItem(draftKey(day, code), JSON.stringify(d)); else localStorage.removeItem(draftKey(day, code)); } catch { /* private mode */ }
}

function restSeconds(rest: string): number | null {
  const n = rest.match(/(\d+(?:\.\d+)?)/);
  if (!n) return null;
  const v = parseFloat(n[1]);
  return /דק/.test(rest) ? v * 60 : v;
}

export function Train() {
  const s = useStore();
  const day = today();
  const c = s.checkins.find((x) => x.day === day);
  const [code, setCode] = useState(() => c?.workout_code && s.plan.rotation.includes(c.workout_code) ? c.workout_code : nextWorkout(s.plan, s.checkins));
  const w = s.plan.workouts.find((x) => x.code === code) ?? s.plan.workouts[0];

  const initial = useMemo<Draft>(() => {
    const saved = loadDraft(day, w.code);
    if (saved) return saved;
    const d: Draft = {};
    for (const e of w.exercises) {
      const todays = s.sets.filter((x) => x.day === day && x.workout_code === w.code && x.exercise === e.name);
      d[e.name] = Array.from({ length: e.sets }, (_, i) => {
        const t = todays.find((x) => x.set_no === i + 1);
        return { weight: t?.weight != null ? String(t.weight) : '', reps: t?.reps != null ? String(t.reps) : '', done: !!t };
      });
    }
    return d;
  }, [w, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<Draft>(initial);
  const [warm, setWarm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timer, setTimer] = useState<{ end: number; total: number } | null>(null);
  useEffect(() => { setDraft(initial); setSaved(false); }, [initial]);

  const update = (name: string, i: number, patch: Partial<Row>) => {
    setDraft((d) => {
      const rows = d[name].map((r, j) => (j === i ? { ...r, ...patch } : r));
      const next = { ...d, [name]: rows };
      storeDraft(day, w.code, next);
      return next;
    });
  };

  async function save() {
    setBusy(true);
    try {
      const rows = w.exercises.flatMap((e) => (draft[e.name] ?? []).map((r, i) => ({ e, r, i }))
        .filter(({ r }) => r.done || r.weight || r.reps)
        .map(({ e, r, i }) => ({ exercise: e.name, set_no: i + 1, weight: r.weight ? parseFloat(r.weight) : null, reps: r.reps ? parseInt(r.reps) : null })));
      await s.saveSets(day, w.code, rows);
      storeDraft(day, w.code, null);
      setSaved(true);
    } finally { setBusy(false); }
  }

  const doneSets = Object.values(draft).flat().filter((r) => r.done).length;
  const totalSets = w.exercises.reduce((a, e) => a + e.sets, 0);

  return (
    <div className="train">
      <header className="top">
        <div>
          <h1 className="date">{w.name}</h1>
          <p className="phase">{w.title}</p>
        </div>
      </header>
      <div className="seg" role="tablist" aria-label="בחירת אימון">
        {s.plan.rotation.map((k) => (
          <button key={k} role="tab" aria-selected={k === w.code} className={k === w.code ? 'on' : ''} onClick={() => setCode(k)}>
            {s.plan.workouts.find((x) => x.code === k)?.name ?? k}
          </button>
        ))}
      </div>
      <p className="goal">{w.goal}</p>

      <section className="card">
        <button className="disclose" aria-expanded={warm} onClick={() => setWarm(!warm)}>חימום, 8–10 דקות</button>
        {warm && <ol className="warm">{s.plan.warmup.map((x) => <li key={x}>{x}</li>)}</ol>}
      </section>

      {w.exercises.map((e, idx) => (
        <ExerciseCard key={e.name + idx} e={e} rows={draft[e.name] ?? []} last={lastSets(s.sets.filter((x) => x.day < day), e.name)}
          onChange={(i, p) => update(e.name, i, p)}
          onRest={() => { const sec = restSeconds(e.rest); if (sec) setTimer({ end: Date.now() + sec * 1000, total: sec }); }} />
      ))}

      <div className="savebar">
        <span>{doneSets}/{totalSets} סטים</span>
        <button className="btn primary" disabled={busy} onClick={save}>{saved ? 'נשמר. לעדכן?' : 'שמירת האימון'}</button>
      </div>
      {saved && <CheckinCard />}
      {timer && <RestTimer {...timer} onDone={() => setTimer(null)} />}
    </div>
  );
}

function ExerciseCard({ e, rows, last, onChange, onRest }: {
  e: Exercise; rows: Row[]; last: { weight: number | null; reps: number | null }[];
  onChange: (i: number, p: Partial<Row>) => void; onRest: () => void;
}) {
  return (
    <section className={'card ex ' + e.kind}>
      <div className="ex-head">
        <h2>{e.name}</h2>
        <span className="ex-dose" dir="ltr">{e.sets}×{e.reps}</span>
      </div>
      {e.notes && <p className="sub">{e.notes}</p>}
      {e.track ? (
        <div className="sets">
          {rows.map((r, i) => (
            <div className={'set' + (r.done ? ' done' : '')} key={i}>
              <span className="set-no">{i + 1}</span>
              <input className="input num" inputMode="decimal" aria-label={`סט ${i + 1} משקל`} placeholder={last[i]?.weight != null ? String(last[i].weight) : 'ק״ג'}
                value={r.weight} onChange={(ev) => onChange(i, { weight: ev.target.value })} />
              <span className="x">×</span>
              <input className="input num" inputMode="numeric" aria-label={`סט ${i + 1} חזרות`} placeholder={last[i]?.reps != null ? String(last[i].reps) : 'חזרות'}
                value={r.reps} onChange={(ev) => onChange(i, { reps: ev.target.value })} />
              <button className="tick" aria-label={`סט ${i + 1} בוצע`} aria-pressed={r.done}
                onClick={() => { onChange(i, { done: !r.done, weight: r.weight || (last[i]?.weight != null ? String(last[i].weight) : ''), reps: r.reps || (last[i]?.reps != null ? String(last[i].reps) : '') }); if (!r.done) onRest(); }}>✓</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="ticks">
          {rows.map((r, i) => (
            <button key={i} className={'tick big' + (r.done ? ' on' : '')} aria-pressed={r.done} aria-label={`סט ${i + 1}`}
              onClick={() => { onChange(i, { done: !r.done }); if (!r.done) onRest(); }}>{i + 1}</button>
          ))}
        </div>
      )}
      <p className="rest">מנוחה {e.rest}{e.track && last.length ? ' · אפור = הפעם הקודמת' : ''}</p>
    </section>
  );
}

function RestTimer({ end, total, onDone }: { end: number; total: number; onDone: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  useEffect(() => { if (left === 0) { navigator.vibrate?.(300); const id = setTimeout(onDone, 1500); return () => clearTimeout(id); } }, [left, onDone]);
  return (
    <div className="timer" role="timer" aria-live="off">
      <div className="timer-bar" style={{ width: `${(left / total) * 100}%` }} />
      <span className="timer-num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      <span>{left ? 'מנוחה' : 'לסט הבא'}</span>
      <button className="link" onClick={onDone}>סגירה</button>
    </div>
  );
}
