import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, dowShort, parseDay, shortDate, today, weekStart } from '../lib/date';
import { avg, currentPhase, isGym, skipReasons, topSets, weekStreak, weeks } from '../lib/stats';
import type { MetricKind } from '../lib/types';
import type { Tab } from '../App';
import { CheckinCard } from './CheckinCard';
import { Columns, HBars, Line } from './charts';
import { Icon } from './icons';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const METRIC: Record<MetricKind, { label: string; unit: string; step: number }> = {
  vertical: { label: 'קפיצה אנכית', unit: 'ס״מ', step: 1 },
  broad: { label: 'קפיצה לרוחק', unit: 'ס״מ', step: 1 },
  squat5: { label: 'סקוואט ל־5', unit: 'ק״ג', step: 2.5 },
  sleep: { label: 'שינה', unit: 'שעות', step: 0.25 },
  bodyweight: { label: 'משקל גוף', unit: 'ק״ג', step: 0.1 },
};

export function Home({ go, openSettings }: { go: (t: Tab) => void; openSettings: () => void }) {
  const s = useStore();
  const t = today();
  const ph = currentPhase(s.plan);
  const goal = s.profile.weekly_goal;
  const minWeek = Math.min(3, goal);

  const wk = weekStart(t);
  const week = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const thisWeek = s.checkins.filter((c) => c.day >= wk);
  const gymThisWeek = thisWeek.filter(isGym).length;
  const streak = weekStreak(s.checkins, minWeek);
  const hist = weeks(s.checkins, 12);
  const reasons = skipReasons(s.checkins, addDays(t, -60));

  const metric = (k: MetricKind) => s.metrics.filter((m) => m.kind === k);
  const sleep7 = avg(metric('sleep').filter((m) => m.day > addDays(t, -7)).map((m) => Number(m.value)));
  const energy14 = avg(s.checkins.filter((c) => c.energy && c.day > addDays(t, -14)).map((c) => c.energy!));

  const tracked = useMemo(() => {
    const names = new Set(s.sets.filter((x) => x.weight != null).map((x) => x.exercise));
    return s.plan.workouts.flatMap((w) => w.exercises).filter((e) => e.track && names.has(e.name)).map((e) => e.name);
  }, [s.sets, s.plan]);
  const [lift, setLift] = useState<string | null>(null);
  const liftName = lift && tracked.includes(lift) ? lift : tracked[0];
  const liftSeries = liftName ? topSets(s.sets, liftName) : [];

  const d = parseDay(t);
  return (
    <div className="home">
      <header className="top">
        <div>
          <h1 className="date">יום {DAYS[d.getUTCDay()]}, {shortDate(t)}</h1>
          <p className="phase">שבוע {ph.week} בתוכנית · {ph.phase.name}</p>
        </div>
        <button className="iconbtn" aria-label="הגדרות" onClick={openSettings}><Icon name="gear" /></button>
      </header>

      <CheckinCard onStart={() => go('train')} />

      <section className="board" aria-label="השבוע">
        <div className="board-score">
          <span className="frac" dir="ltr"><span className="num">{gymThisWeek}</span><span className="of">/{goal}</span></span>
          <span className="board-label">אימונים השבוע</span>
        </div>
        <div className="board-side">
          <span className="num small">{streak}</span>
          <span className="board-label">{streak === 1 ? 'שבוע ברצף' : 'שבועות ברצף'}<br /><span className="muted">עם {minWeek} אימונים ומעלה</span></span>
        </div>
        <ol className="days">
          {week.map((day) => {
            const c = thisWeek.find((x) => x.day === day);
            const cls = c ? (isGym(c) ? 'gym' : c.status) : day < t ? 'none' : 'future';
            const title = c ? (isGym(c) ? (c.workout_code ?? 'אימון') : c.status === 'game' ? 'משחק' : 'דילוג') : '';
            return (
              <li key={day} className={cls + (day === t ? ' today' : '')} title={title}>
                <span className="cell">{c && isGym(c) ? (c.workout_code ?? '') : c?.status === 'game' ? '●' : ''}</span>
                <span className="dow">{dowShort(day)}</span>
              </li>
            );
          })}
        </ol>
        <p className="legend"><i className="gym" />אימון <i className="game" />משחק <i className="skipped" />דילוג</p>
      </section>

      <section className="card">
        <h2>אימונים בשבוע, 12 שבועות</h2>
        {s.checkins.length === 0
          ? <p className="empty">אחרי האימון הראשון יופיע כאן הגרף.</p>
          : <Columns goal={goal} data={hist.map((h, i) => ({ label: shortDate(h.start), value: h.gym, current: i === hist.length - 1, tip: `שבוע ${shortDate(h.start)}: ${h.gym} אימונים${h.games ? `, ${h.games} משחקים` : ''}` }))} />}
        <p className="note">הקו: היעד של {goal} בשבוע.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>מבחני קפיצה וכוח</h2>
          <MetricAdd kinds={['vertical', 'broad', 'squat5']} />
        </div>
        {metric('vertical').length > 0
          ? <Line unit="ס״מ" fmtX={shortDate} points={metric('vertical').map((m) => ({ x: m.day, y: Number(m.value) }))} />
          : <p className="empty">מבחן ראשון: עומדים ליד קיר, מסמנים את הגובה עם יד מושטת, ואז את הגובה בקפיצה. ההפרש בס״מ נרשם כאן. חוזרים על זה בשבועות 1, 5 ו־9.</p>}
        <div className="stats">
          {(['vertical', 'broad', 'squat5'] as MetricKind[]).map((k) => {
            const xs = metric(k);
            const last = xs[xs.length - 1], first = xs[0];
            return (
              <div className="stat" key={k}>
                <span className="stat-val">{last ? Number(last.value) : '–'}<small> {METRIC[k].unit}</small></span>
                <span className="stat-label">{METRIC[k].label}</span>
                {xs.length > 1 && <span className="stat-delta">{delta(Number(last.value) - Number(first.value))} מההתחלה</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>התקדמות בתרגילים</h2>
          {tracked.length > 1 && (
            <select className="select" value={liftName} onChange={(e) => setLift(e.target.value)} aria-label="תרגיל">
              {tracked.map((n) => <option key={n}>{n}</option>)}
            </select>
          )}
        </div>
        {liftSeries.length
          ? <>
              <p className="sub">{liftName}: הסט הכבד בכל אימון</p>
              <Line unit="ק״ג" fmtX={shortDate} points={liftSeries.map((p) => ({ x: p.day, y: p.weight, tip: `${p.weight} ק״ג × ${p.reps}` }))} />
            </>
          : <p className="empty">כשתרשום משקלים במסך האימון, תראה כאן איך כל תרגיל מתקדם.</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>שינה ואנרגיה</h2>
          <MetricAdd kinds={['sleep', 'bodyweight']} />
        </div>
        <div className="stats">
          <div className="stat"><span className="stat-val">{sleep7 != null ? sleep7.toFixed(1) : '–'}<small> שעות</small></span><span className="stat-label">שינה בממוצע, 7 ימים</span></div>
          <div className="stat"><span className="stat-val">{energy14 != null ? energy14.toFixed(1) : '–'}<small> /5</small></span><span className="stat-label">אנרגיה באימונים, 14 יום</span></div>
          <div className="stat"><span className="stat-val">{metric('bodyweight').at(-1) ? Number(metric('bodyweight').at(-1)!.value) : '–'}<small> ק״ג</small></span><span className="stat-label">משקל גוף</span></div>
        </div>
        {metric('sleep').length > 1 && <Line unit="שעות" fmtX={shortDate} points={metric('sleep').slice(-30).map((m) => ({ x: m.day, y: Number(m.value) }))} />}
        <p className="note">היעד: 7.5–8 שעות. גם 45 דקות יותר בלילה מורגשות תוך שבוע.</p>
      </section>

      {reasons.length > 0 && (
        <section className="card">
          <h2>למה פספסתי, 60 יום</h2>
          <HBars data={reasons.map((r) => ({ label: r.reason, value: r.count }))} />
        </section>
      )}
    </div>
  );
}

function delta(n: number) {
  const r = Math.round(n * 10) / 10;
  return (r > 0 ? '+' : '') + r;
}

function MetricAdd({ kinds }: { kinds: MetricKind[] }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MetricKind>(kinds[0]);
  const [value, setValue] = useState('');
  const [day, setDay] = useState(today());
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="link" onClick={() => setOpen(true)}>הוספה</button>;
  return (
    <form className="metric-form" onSubmit={async (e) => {
      e.preventDefault();
      const v = parseFloat(value);
      if (!isFinite(v)) return;
      setBusy(true);
      try { await s.setMetric(day, kind, v); setOpen(false); setValue(''); } finally { setBusy(false); }
    }}>
      <select className="select" value={kind} onChange={(e) => setKind(e.target.value as MetricKind)}>
        {kinds.map((k) => <option key={k} value={k}>{METRIC[k].label}</option>)}
      </select>
      <input className="input num" inputMode="decimal" placeholder={METRIC[kind].unit} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <input className="input" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
      <button className="btn primary" disabled={busy}>שמירה</button>
      <button type="button" className="link" onClick={() => setOpen(false)}>ביטול</button>
    </form>
  );
}
