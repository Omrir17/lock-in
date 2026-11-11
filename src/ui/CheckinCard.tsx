import { useState } from 'react';
import { useStore } from '../lib/store';
import { sb } from '../lib/supabase';
import { nextWorkout } from '../lib/stats';
import { nowMinutes, today } from '../lib/date';
import type { Checkin } from '../lib/types';

const REASONS = ['עייף', 'לא ישנתי מספיק', 'עבודה או לימודים', 'אין זמן', 'כאב או פציעה', 'יום מנוחה מתוכנן'];

type Mode = 'idle' | 'pick' | 'why' | 'review';

export function CheckinCard({ day = today(), onStart }: { day?: string; onStart?: () => void }) {
  const s = useStore();
  const c = s.checkins.find((x) => x.day === day);
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = nextWorkout(s.plan, s.checkins, day);
  const wname = (code: string | null) => {
    const w = s.plan.workouts.find((x) => x.code === code);
    return w ? `${w.name} · ${w.title}` : code ?? '';
  };

  async function save(patch: Partial<Checkin>, note: string) {
    setBusy(true); setErr(null);
    try {
      await s.upsertCheckin(day, patch);
      // keep the coach in the loop without spending a model call
      await sb.from('messages').insert({ role: 'user', content: note });
      await s.reload(['messages']);
      setMode('idle');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const reviewDue = nowMinutes() >= toMin(s.profile.review_time) - 60 || day < today();

  let body;
  if (mode === 'pick') {
    body = (
      <>
        <p className="q">איזה אימון?</p>
        <div className="chips">
          {s.plan.rotation.map((code) => (
            <button key={code} disabled={busy} className={'chip' + (code === next ? ' on' : '')}
              onClick={() => save({ status: 'going', workout_code: code, skip_reason: null }, `הולך היום – ${wname(code)}`)}>
              {s.plan.workouts.find((w) => w.code === code)?.name ?? code}
            </button>
          ))}
        </div>
        <p className="hint">מסומן: הבא בתור.</p>
      </>
    );
  } else if (mode === 'why') {
    body = <WhyPicker busy={busy} onPick={(r) => save({ status: 'skipped', skip_reason: r, workout_code: null, rating: null, energy: null }, `לא היום – ${r}`)} />;
  } else if (mode === 'review' || (c?.status === 'going' && reviewDue) || (c?.status === 'done' && !c.rating)) {
    body = <Review c={c} busy={busy} title={`איך היה ${wname(c?.workout_code ?? next)}?`}
      onSave={(rating, energy, notes) => save({ status: 'done', rating, energy, notes: notes || null, workout_code: c?.workout_code ?? next },
        `האימון הלך ${rating}/5, אנרגיה ${energy}/5${notes ? ` – ${notes}` : ''}`)}
      onSkip={() => setMode('why')} />;
  } else if (!c) {
    body = (
      <>
        <p className="q">{day === today() ? 'הולך היום לחדר כושר?' : 'מה היה ביום הזה?'}</p>
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={() => setMode('pick')}>הולך</button>
          <button className="btn" disabled={busy} onClick={() => save({ status: 'game', workout_code: null, skip_reason: null }, 'היום יש משחק')}>יש משחק</button>
          <button className="btn" disabled={busy} onClick={() => setMode('why')}>לא היום</button>
        </div>
        <p className="hint">הבא בתור: {wname(next)}</p>
      </>
    );
  } else if (c.status === 'going') {
    body = (
      <>
        <p className="q">היום: {wname(c.workout_code)}</p>
        <div className="actions">
          {onStart && <button className="btn primary" onClick={onStart}>לפתוח את האימון</button>}
          <button className="btn" onClick={() => setMode('review')}>סיימתי</button>
          <button className="btn ghost" onClick={() => setMode('why')}>בסוף לא הלכתי</button>
        </div>
      </>
    );
  } else {
    const line = c.status === 'done' ? `${wname(c.workout_code)}${c.rating ? ` · ${c.rating}/5` : ''}${c.energy ? ` · אנרגיה ${c.energy}/5` : ''}`
      : c.status === 'game' ? 'יום משחק' : `לא היום – ${c.skip_reason ?? ''}`;
    body = (
      <div className="settled">
        <span className={'pip ' + c.status} aria-hidden />
        <span>{line}</span>
        <button className="link" onClick={async () => {
          if (c.status === 'done') { setMode('review'); return; }
          await sb.from('checkins').delete().eq('day', day);
          await s.reload(['checkins']);
        }}>
          לשנות
        </button>
      </div>
    );
  }

  return (
    <section className="checkin">
      {body}
      {mode !== 'idle' && <button className="link back" onClick={() => setMode('idle')}>חזרה</button>}
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function WhyPicker({ busy, onPick }: { busy: boolean; onPick: (r: string) => void }) {
  const [other, setOther] = useState('');
  return (
    <>
      <p className="q">למה לא היום?</p>
      <div className="chips">
        {REASONS.map((r) => <button key={r} className="chip" disabled={busy} onClick={() => onPick(r)}>{r}</button>)}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (other.trim()) onPick(other.trim()); }}>
        <input className="input" placeholder="סיבה אחרת" value={other} onChange={(e) => setOther(e.target.value)} />
        <button className="btn" disabled={busy || !other.trim()}>שמירה</button>
      </form>
    </>
  );
}

function Review({ c, busy, title, onSave, onSkip }: {
  c?: Checkin; busy: boolean; title: string;
  onSave: (rating: number, energy: number, notes: string) => void; onSkip: () => void;
}) {
  const [rating, setRating] = useState(c?.rating ?? 0);
  const [energy, setEnergy] = useState(c?.energy ?? 0);
  const [notes, setNotes] = useState(c?.notes ?? '');
  return (
    <>
      <p className="q">{title}</p>
      <Scale label="האימון" value={rating} onChange={setRating} />
      <Scale label="אנרגיה" value={energy} onChange={setEnergy} />
      <input className="input" placeholder="הערה (לא חובה)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="actions">
        <button className="btn primary" disabled={busy || !rating || !energy} onClick={() => onSave(rating, energy, notes.trim())}>שמירה</button>
        <button className="btn ghost" onClick={onSkip}>בסוף לא הלכתי</button>
      </div>
    </>
  );
}

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="scale">
      <span className="scale-label">{label}</span>
      <div className="scale-btns" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
