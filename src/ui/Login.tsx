import { useEffect, useState } from 'react';
import { api, setToken } from '../lib/api';

export function Login() {
  const [mode, setMode] = useState<'in' | 'up' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ hasUser: boolean }>('auth/status').then((r) => setMode(r.hasUser ? 'in' : 'up')).catch(() => setMode('in'));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const { token } = await api<{ token: string }>(mode === 'up' ? 'auth/signup' : 'auth/login', { body: { email, password } });
      setToken(token);
    } catch (err) {
      setMsg((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="login-mark">
        <img src="icon-192.png" alt="" width={72} height={72} />
        <h1>Lock-in</h1>
        <p>{mode === 'up' ? 'פעם ראשונה כאן: יוצרים את החשבון שלך.' : 'התוכנית, היומן והמאמן שלך במקום אחד.'}</p>
      </div>
      {mode && (
        <form onSubmit={submit} className="login-form">
          <label>אימייל<input className="input" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>סיסמה<input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} dir="ltr" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn primary wide" disabled={busy}>{mode === 'in' ? 'כניסה' : 'יצירת חשבון'}</button>
          {msg && <p className="err">{msg}</p>}
        </form>
      )}
    </div>
  );
}
