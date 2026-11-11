import { useEffect, useState } from 'react';
import { getToken } from './lib/api';
import { StoreProvider } from './lib/store';
import { Login } from './ui/Login';
import { Home } from './ui/Home';
import { Train } from './ui/Train';
import { Coach } from './ui/Coach';
import { PlanView } from './ui/PlanView';
import { Settings } from './ui/Settings';
import { Icon } from './ui/icons';

export type Tab = 'home' | 'train' | 'coach' | 'plan';
const TABS: { id: Tab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'home', label: 'בית', icon: 'home' },
  { id: 'train', label: 'אימון', icon: 'bar' },
  { id: 'coach', label: 'מאמן', icon: 'chat' },
  { id: 'plan', label: 'תוכנית', icon: 'list' },
];

function tabFromUrl(url: string): Tab | null {
  const t = new URL(url, location.href).searchParams.get('tab');
  return TABS.some((x) => x.id === t) ? (t as Tab) : null;
}

export default function App() {
  const [token, setTok] = useState(getToken);
  useEffect(() => {
    const on = () => setTok(getToken());
    window.addEventListener('lockin-auth', on);
    return () => window.removeEventListener('lockin-auth', on);
  }, []);
  if (!token) return <Login />;
  return <StoreProvider><Shell /></StoreProvider>;
}

export function Shell() {
  const [tab, setTab] = useState<Tab>(() => tabFromUrl(location.href) ?? 'home');
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    if (location.search) history.replaceState(null, '', location.pathname);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open') { const t = tabFromUrl(e.data.url); if (t) setTab(t); }
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => { document.querySelector('.screen')?.scrollTo(0, 0); }, [tab]);

  return (
    <div className="app">
      <main className={'screen ' + tab}>
        {tab === 'home' && <Home go={setTab} openSettings={() => setSettings(true)} />}
        {tab === 'train' && <Train />}
        {tab === 'coach' && <Coach />}
        {tab === 'plan' && <PlanView go={setTab} />}
      </main>
      <nav className="tabs" aria-label="ניווט">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {settings && <Settings close={() => setSettings(false)} />}
    </div>
  );
}
