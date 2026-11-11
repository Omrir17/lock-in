import { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { dayOf, today } from '../lib/date';
import { CheckinCard } from './CheckinCard';
import { Icon } from './icons';

const STARTERS = [
  'תכיר אותי: תשאל אותי מה שאתה צריך לדעת',
  'לא ישנתי טוב. להוריד עומס היום?',
  'תחליף לי תרגיל שאין לו מכשיר פנוי',
  'מה לאכול לפני אימון בערב?',
];

export function Coach() {
  const s = useStore();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const t = today();

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [s.messages.length, s.sending]);

  const prompts = s.messages.filter((m) => m.role === 'assistant' && m.kind !== 'chat' && dayOf(new Date(m.created_at)) === t);
  const lastPromptId = prompts.at(-1)?.id;

  async function send(v = text) {
    const msg = v.trim();
    if (!msg || s.sending) return;
    setText('');
    await s.sendChat(msg);
  }

  let lastDay = '';
  return (
    <div className="coach">
      <div className="thread" aria-live="polite">
        {s.messages.length === 0 && (
          <div className="intro">
            <h1>המאמן</h1>
            <p>הוא רואה את התוכנית, את היומן ואת המדדים שלך, וזוכר מה שתספר לו. אפשר לבקש ממנו לשנות את התוכנית.</p>
          </div>
        )}
        {s.messages.map((m) => {
          const d = dayOf(new Date(m.created_at));
          const sep = d !== lastDay ? <div className="daysep">{d === t ? 'היום' : new Date(m.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', weekday: 'short' })}</div> : null;
          lastDay = d;
          return (
            <Fragment key={m.id}>
              {sep}
              <div className={'bubble ' + m.role}>{rich(m.content)}</div>
              {m.id === lastPromptId && <CheckinCard />}
            </Fragment>
          );
        })}
        {s.sending && <div className="bubble assistant typing" aria-label="המאמן כותב"><span /><span /><span /></div>}
        <div ref={end} />
      </div>
      {s.messages.length < 4 && (
        <div className="starters">
          {STARTERS.map((x) => <button key={x} className="chip" onClick={() => send(x)} disabled={s.sending}>{x}</button>)}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea className="input" rows={1} placeholder="לכתוב למאמן" value={text}
          onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send(); } }} />
        <button className="send" aria-label="שליחה" disabled={!text.trim() || s.sending}><Icon name="send" /></button>
      </form>
    </div>
  );
}

/** Just enough markdown for chat: **bold**, line breaks, "- " bullets. */
function rich(text: string): ReactNode {
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*[-•*]\s+/.test(line);
    const body = line.replace(/^\s*[-•*]\s+/, '');
    const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p);
    return <p key={i} className={bullet ? 'li' : undefined}>{parts}</p>;
  });
}
