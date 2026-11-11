import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api, setToken } from '../lib/api';
import { disablePush, enablePush, pushState, PushState } from '../lib/push';
import { Icon } from './icons';

export function Settings({ close }: { close: () => void }) {
  const s = useStore();
  const [push, setPush] = useState<PushState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [fact, setFact] = useState('');

  useEffect(() => { pushState().then(setPush); }, []);

  const run = async (f: () => Promise<unknown>, done?: string) => {
    setErr(null); setOk(null);
    try { await f(); if (done) setOk(done); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="הגדרות">
      <div className="panel">
        <header className="top">
          <h1 className="date">הגדרות</h1>
          <button className="iconbtn" aria-label="סגירה" onClick={close}><Icon name="close" /></button>
        </header>

        <section className="card">
          <h2>התראות</h2>
          {push === 'needs-install' && <p className="sub">כדי לקבל התראות באייפון: שיתוף ← הוספה למסך הבית, ואז לפתוח את Lock-in מהאייקון.</p>}
          {push === 'unsupported' && <p className="sub">הדפדפן הזה לא תומך בהתראות. צריך iOS 16.4 ומעלה, ולפתוח מהאייקון במסך הבית.</p>}
          {push === 'denied' && <p className="sub">ההתראות חסומות. מפעילים ב־הגדרות ← התראות ← Lock-in.</p>}
          {(push === 'off' || push === 'on') && (
            <div className="actions">
              {push === 'off'
                ? <button className="btn primary" onClick={() => run(async () => { await enablePush(); setPush('on'); }, 'ההתראות פועלות.')}>להפעיל התראות</button>
                : <>
                    <button className="btn" onClick={() => run(async () => {
                      const data = await api<{ sent: number }>('push/test', { body: {} });
                      if (!data.sent) throw new Error('לא נמצא מכשיר רשום. כבה והפעל מחדש.');
                    }, 'נשלחה התראת בדיקה.')}>התראת בדיקה</button>
                    <button className="btn ghost" onClick={() => run(async () => { await disablePush(); setPush('off'); })}>לכבות במכשיר הזה</button>
                  </>}
            </div>
          )}
          <div className="edit-row">
            <label>שאלת ״הולך היום?״<input className="input" type="time" value={s.profile.ask_time} onChange={(e) => e.target.value && run(() => s.saveProfile({ ask_time: e.target.value }))} /></label>
            <label>שאלת ״איך היה?״<input className="input" type="time" value={s.profile.review_time} onChange={(e) => e.target.value && run(() => s.saveProfile({ review_time: e.target.value }))} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={s.profile.push_enabled} onChange={(e) => run(() => s.saveProfile({ push_enabled: e.target.checked }))} />לשלוח את השאלות היומיות</label>
        </section>

        <section className="card">
          <h2>יעד שבועי</h2>
          <div className="seg small">
            {[3, 4, 5].map((n) => (
              <button key={n} className={s.profile.weekly_goal === n ? 'on' : ''} onClick={() => run(() => s.saveProfile({ weekly_goal: n }))}>{n} אימונים</button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>מה המאמן יודע עליך</h2>
          <p className="sub">המאמן מוסיף לכאן דברים שסיפרת לו. אפשר למחוק או להוסיף בעצמך.</p>
          <ul className="memories">
            {s.memories.map((m) => (
              <li key={m.id}>
                <span>{m.fact}</span>
                <button className="iconbtn danger" aria-label="מחיקה" onClick={() => run(() => s.deleteMemory(m.id))}><Icon name="trash" size={18} /></button>
              </li>
            ))}
            {s.memories.length === 0 && <li className="muted">עדיין ריק.</li>}
          </ul>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (fact.trim()) run(async () => { await s.addMemory(fact.trim()); setFact(''); }); }}>
            <input className="input" placeholder="למשל: כאב קל בברך שמאל בנחיתות" value={fact} onChange={(e) => setFact(e.target.value)} />
            <button className="btn" disabled={!fact.trim()}>הוספה</button>
          </form>
        </section>

        {err && <p className="err">{err}</p>}
        {ok && <p className="ok">{ok}</p>}
        <button className="link signout" onClick={async () => { await api('auth/logout', { body: {} }).catch(() => {}); setToken(null); }}>יציאה מהחשבון</button>
      </div>
    </div>
  );
}
