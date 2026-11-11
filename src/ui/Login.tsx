import { useState } from 'react';
import { sb } from '../lib/supabase';

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error, data } = mode === 'in'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(hebrew(error.message));
    else if (mode === 'up' && !data.session) setMsg('נשלח אליך מייל אימות. אחרי האישור חוזרים לכאן ונכנסים.');
  }

  return (
    <div className="login">
      <div className="login-mark">
        <img src="icon-192.png" alt="" width={72} height={72} />
        <h1>Lock-in</h1>
        <p>התוכנית, היומן והמאמן שלך במקום אחד.</p>
      </div>
      <form onSubmit={submit} className="login-form">
        <label>אימייל<input className="input" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>סיסמה<input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} dir="ltr" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn primary wide" disabled={busy}>{mode === 'in' ? 'כניסה' : 'יצירת חשבון'}</button>
        {msg && <p className="err">{msg}</p>}
        <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
          {mode === 'in' ? 'אין לך חשבון? יצירת חשבון' : 'יש לך חשבון? כניסה'}
        </button>
      </form>
    </div>
  );
}

function hebrew(m: string) {
  if (/invalid login/i.test(m)) return 'האימייל או הסיסמה לא נכונים.';
  if (/already registered/i.test(m)) return 'כבר יש חשבון עם האימייל הזה. אפשר להיכנס.';
  if (/signups not allowed/i.test(m)) return 'יצירת חשבונות חדשים סגורה.';
  return m;
}
