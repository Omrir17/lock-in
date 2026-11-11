import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { shortDate } from '../lib/date';
import { currentPhase } from '../lib/stats';
import type { Exercise, ExKind, Plan, Workout } from '../lib/types';
import type { Tab } from '../App';
import { Icon } from './icons';

const KIND: Record<ExKind, string> = { power: 'כוח מתפרץ', main: 'עיקרי', accessory: 'עזר' };

export function PlanView({ go }: { go: (t: Tab) => void }) {
  const s = useStore();
  const ph = currentPhase(s.plan);
  const cycleLen = Math.max(...s.plan.phases.map((p) => p.toWeek));
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveWorkout(w: Workout) {
    const plan: Plan = { ...s.plan, workouts: s.plan.workouts.map((x) => (x.code === w.code ? w : x)) };
    await s.savePlan(plan);
    setEditing(null);
    setMsg('התוכנית נשמרה.');
  }

  async function undo() {
    const data = await api<{ data: Plan; created_at: string }[]>('plan/versions');
    if (data.length < 2) { setMsg('אין גרסה קודמת.'); return; }
    await s.savePlan(data[1].data, 'חזרה לגרסה קודמת');
    setMsg(`חזרנו לגרסה מ־${shortDate(data[1].created_at.slice(0, 10))}.`);
  }

  return (
    <div className="plan">
      <header className="top">
        <div>
          <h1 className="date">התוכנית</h1>
          <p className="phase">מחזור {ph.cycle}, שבוע {ph.inCycle} מתוך {cycleLen} · {ph.phase.name}</p>
        </div>
      </header>

      <section className="card">
        <div className="phasebar" role="img" aria-label={`שבוע ${ph.inCycle} מתוך ${cycleLen}`}>
          {Array.from({ length: cycleLen }, (_, i) => {
            const p = s.plan.phases.find((x) => i + 1 >= x.fromWeek && i + 1 <= x.toWeek);
            return <span key={i} className={'wk p' + s.plan.phases.indexOf(p!) + (i + 1 === ph.inCycle ? ' now' : '') + (i + 1 < ph.inCycle ? ' past' : '')}>{i + 1}</span>;
          })}
        </div>
        <ul className="phases">
          {s.plan.phases.map((p) => (
            <li key={p.name} className={p === ph.phase ? 'on' : ''}>
              <strong>שבועות {p.fromWeek === p.toWeek ? p.fromWeek : `${p.fromWeek}–${p.toWeek}`}: {p.name}</strong>
              <span>{p.notes}</span>
            </li>
          ))}
        </ul>
        <label className="inline">שבוע 1 התחיל ב־
          <input className="input" type="date" value={s.plan.startDate} onChange={(e) => e.target.value && s.savePlan({ ...s.plan, startDate: e.target.value })} />
        </label>
      </section>

      <section className="card">
        <h2>כללים</h2>
        <ul className="rules">{s.plan.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>

      <section className="ask-coach">
        <p>אפשר גם לבקש מהמאמן, למשל: ״תחליף את הנורדיק ב־RDL על רגל אחת״.</p>
        <button className="btn" onClick={() => go('coach')}>למאמן</button>
      </section>

      {s.plan.rotation.map((code) => {
        const w = s.plan.workouts.find((x) => x.code === code);
        if (!w) return null;
        return editing === code
          ? <WorkoutEditor key={code} w={w} onSave={saveWorkout} onCancel={() => setEditing(null)} />
          : (
            <section className="card wo" key={code}>
              <div className="card-head">
                <h2>{w.name} · {w.title}</h2>
                <button className="link" onClick={() => { setEditing(code); setMsg(null); }}>עריכה</button>
              </div>
              <p className="sub">{w.goal}</p>
              <table className="extable">
                <thead><tr><th>תרגיל</th><th>סטים×חזרות</th><th>מנוחה</th></tr></thead>
                <tbody>
                  {w.exercises.map((e, i) => (
                    <tr key={i} className={e.kind}>
                      <td><span className="exname">{e.name}</span>{e.notes && <span className="exnote">{e.notes}</span>}</td>
                      <td className="num"><bdi dir="ltr">{e.sets}×{e.reps}</bdi></td>
                      <td className="num">{e.rest}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
      })}

      <div className="plan-foot">
        {msg && <p className="ok">{msg}</p>}
        <button className="link" onClick={undo}>לחזור לגרסה הקודמת של התוכנית</button>
      </div>
    </div>
  );
}

function WorkoutEditor({ w, onSave, onCancel }: { w: Workout; onSave: (w: Workout) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<Workout>(() => structuredClone(w));
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Partial<Exercise>) => setDraft((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...p } : e)) }));
  const move = (i: number, dir: -1 | 1) => setDraft((d) => {
    const ex = [...d.exercises];
    const j = i + dir;
    if (j < 0 || j >= ex.length) return d;
    [ex[i], ex[j]] = [ex[j], ex[i]];
    return { ...d, exercises: ex };
  });
  return (
    <section className="card wo editing">
      <div className="edit-row">
        <input className="input" aria-label="שם" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="input" aria-label="כותרת" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </div>
      <textarea className="input" aria-label="מטרה" rows={2} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} />
      {draft.exercises.map((e, i) => (
        <div className="ex-edit" key={i}>
          <input className="input" aria-label="תרגיל" value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} />
          <div className="edit-row">
            <label>סטים<input className="input num" inputMode="numeric" value={e.sets} onChange={(ev) => set(i, { sets: Math.max(1, parseInt(ev.target.value) || 1) })} /></label>
            <label>חזרות<input className="input" value={e.reps} onChange={(ev) => set(i, { reps: ev.target.value })} /></label>
            <label>מנוחה<input className="input" value={e.rest} onChange={(ev) => set(i, { rest: ev.target.value })} /></label>
          </div>
          <input className="input" aria-label="דגשים" placeholder="דגשים" value={e.notes ?? ''} onChange={(ev) => set(i, { notes: ev.target.value })} />
          <div className="edit-row tools">
            <select className="select" value={e.kind} onChange={(ev) => set(i, { kind: ev.target.value as ExKind })} aria-label="סוג">
              {(Object.keys(KIND) as ExKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={!!e.track} onChange={(ev) => set(i, { track: ev.target.checked })} />לרשום משקלים</label>
            <button className="iconbtn" aria-label="למעלה" onClick={() => move(i, -1)}><Icon name="up" size={18} /></button>
            <button className="iconbtn" aria-label="למטה" onClick={() => move(i, 1)}><Icon name="down" size={18} /></button>
            <button className="iconbtn danger" aria-label="מחיקה" onClick={() => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }))}><Icon name="trash" size={18} /></button>
          </div>
        </div>
      ))}
      <button className="link" onClick={() => setDraft((d) => ({ ...d, exercises: [...d.exercises, { name: 'תרגיל חדש', sets: 3, reps: '8–10', rest: '90 שנ׳', kind: 'accessory', track: true }] }))}>
        הוספת תרגיל
      </button>
      <div className="actions">
        <button className="btn primary" disabled={busy || draft.exercises.some((e) => !e.name.trim())} onClick={async () => { setBusy(true); try { await onSave(draft); } finally { setBusy(false); } }}>שמירה</button>
        <button className="btn ghost" onClick={onCancel}>ביטול</button>
      </div>
    </section>
  );
}
